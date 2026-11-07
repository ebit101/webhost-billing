import { Injectable } from '@nestjs/common';
import { ApplicationException } from '../../common/errors/application.exception';
import { type SslRefund } from '@webhost-billing/database';
import {
  sslRefundRequestSchema,
  sslRefundReconcileSchema,
  type SslRefundRequest,
  type SslRefundReconcile,
} from '@webhost-billing/shared';
import type { AuthRequestContext } from '../auth/auth.types';
import {
  SslCheckoutService,
  lockSslInvoice,
  sslAudit,
  sslProblem,
} from './ssl-checkout.service';
import type { SslRefundObservation } from './ssl-provider.protocol';

@Injectable()
export class SslRefundService {
  constructor(private readonly checkouts: SslCheckoutService) {}
  private get prisma() {
    return this.checkouts.prisma;
  }
  async request(
    paymentId: string,
    input: SslRefundRequest,
    actor: AuthRequestContext,
  ) {
    input = sslRefundRequestSchema.parse(input);
    await this.assertMfa(actor);
    const checkout = await this.checkouts.getBound(paymentId);
    const result = await this.prisma.$transaction(async (tx) => {
      await lockSslInvoice(tx, checkout.invoiceId);
      const current = await tx.sslCheckout.findUniqueOrThrow({
        where: { id: checkout.id },
        include: { payment: true, refunds: true },
      });
      const existing = await tx.sslRefund.findUnique({
        where: { submissionKey: input.submissionKey },
      });
      if (existing) {
        if (
          existing.checkoutId !== current.id ||
          existing.amount !== BigInt(input.amount) ||
          existing.reason !== input.reason ||
          existing.actorUserId !== actor.identity.userId
        )
          throw sslProblem('This refund key was already used.', 409);
        return { refund: existing, fresh: false };
      }
      if (
        current.state !== 'CAPTURED' ||
        !current.bankReference ||
        current.payment.status !== 'SUCCEEDED'
      )
        throw sslProblem('Only a confirmed captured payment can be refunded.');
      const reserved = current.refunds
        .filter((value) => value.state !== 'FAILED')
        .reduce((sum, value) => sum + value.amount, 0n);
      if (BigInt(input.amount) > current.payment.amount - reserved)
        throw sslProblem(
          'This amount exceeds the remaining unreserved capture.',
        );
      const refund = await tx.sslRefund.create({
        data: {
          checkoutId: current.id,
          submissionKey: input.submissionKey,
          amount: BigInt(input.amount),
          reason: input.reason,
          actorUserId: actor.identity.userId,
          state: 'SUBMITTING',
        },
      });
      await sslAudit(
        tx,
        'SSL_REFUND_APPROVED',
        current.id,
        actor.identity.userId,
        { refundId: refund.id, amount: input.amount, reason: input.reason },
      );
      return { refund, fresh: true };
    });
    if (result.fresh) {
      try {
        const proof = await this.checkouts.gateway.refundBound(
          this.checkouts.account(checkout),
          {
            bankReference: checkout.bankReference!,
            amount: result.refund.amount,
            reference: result.refund.id,
          },
        );
        await this.finish(result.refund, proof, actor, false);
      } catch (caught) {
        await this.prisma.sslRefund.updateMany({
          where: {
            id: result.refund.id,
            state: { in: ['SUBMITTING', 'PENDING'] },
          },
          data: { state: 'UNKNOWN' },
        });
        if (caught instanceof ApplicationException) throw caught;
      }
    }
    return this.checkouts.public(await this.checkouts.getBound(paymentId));
  }
  async reconcile(
    refundId: string,
    input: SslRefundReconcile,
    actor: AuthRequestContext,
  ) {
    input = sslRefundReconcileSchema.parse(input);
    await this.assertMfa(actor);
    const refund = await this.prisma.sslRefund.findUnique({
      where: { id: refundId },
      include: { checkout: true },
    });
    if (!refund) throw sslProblem('Refund was not found.', 404);
    if (['SUCCEEDED', 'FAILED'].includes(refund.state))
      return this.checkouts.public(
        await this.checkouts.getBound(refund.checkout.paymentId),
      );
    if (
      refund.providerReference &&
      input.providerReference &&
      refund.providerReference !== input.providerReference
    )
      throw sslProblem('The refund reference is already bound.', 409);
    const reference = refund.providerReference ?? input.providerReference;
    if (!reference)
      throw sslProblem(
        'The refund outcome is unknown. A verified provider reference is required; do not resubmit the refund.',
        409,
      );
    try {
      const proof = await this.checkouts.gateway.refundBound(
        this.checkouts.account(refund.checkout),
        { providerReference: reference },
      );
      if (
        !refund.providerReference &&
        (!proof.amount || proof.amount !== refund.amount)
      )
        throw sslProblem(
          'The provider did not prove the requested refund amount. Keep this refund in review.',
          409,
        );
      await this.finish(
        refund,
        proof,
        actor,
        !refund.providerReference,
        input.reason,
      );
    } catch (caught) {
      if (caught instanceof ApplicationException) throw caught;
      throw sslProblem(
        'The refund could not be confirmed. It remains reserved for review.',
        503,
      );
    }
    return this.checkouts.public(
      await this.checkouts.getBound(refund.checkout.paymentId),
    );
  }
  private async finish(
    saved: SslRefund,
    proof: SslRefundObservation,
    actor: AuthRequestContext,
    link: boolean,
    linkReason?: string,
  ) {
    const checkout = await this.prisma.sslCheckout.findUniqueOrThrow({
      where: { id: saved.checkoutId },
    });
    if (
      proof.bankReference !== checkout.bankReference ||
      (proof.amount !== null && proof.amount !== saved.amount)
    )
      throw sslProblem('The refund proof does not match this capture.', 409);
    await this.prisma.$transaction(async (tx) => {
      await lockSslInvoice(tx, checkout.invoiceId);
      const refund = await tx.sslRefund.findUniqueOrThrow({
        where: { id: saved.id },
      });
      if (['SUCCEEDED', 'FAILED'].includes(refund.state)) return;
      if (
        refund.providerReference &&
        refund.providerReference !== proof.reference
      )
        throw sslProblem('A different refund reference was returned.', 409);
      const other = await tx.sslRefund.findFirst({
        where: { providerReference: proof.reference, id: { not: refund.id } },
      });
      if (other)
        throw sslProblem('This provider refund was already recorded.', 409);
      if (link)
        await sslAudit(
          tx,
          'SSL_REFUND_REFERENCE_LINKED',
          checkout.id,
          actor.identity.userId,
          { refundId: refund.id, reason: linkReason ?? '' },
        );
      if (proof.status !== 'SUCCEEDED') {
        await tx.sslRefund.update({
          where: { id: refund.id },
          data: { providerReference: proof.reference, state: proof.status },
        });
        return;
      }
      const original = await tx.payment.findUniqueOrThrow({
        where: { id: checkout.paymentId },
      });
      const invoice = await tx.invoice.findUniqueOrThrow({
        where: { id: checkout.invoiceId },
      });
      if (checkout.appliedToInvoice && invoice.amountPaid < refund.amount)
        throw sslProblem(
          'The invoice now requires financial review before this refund can be posted.',
          409,
        );
      const payment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          originalPaymentId: original.id,
          createdByUserId: refund.actorUserId,
          reviewedByUserId: actor.identity.userId,
          kind: 'REFUND',
          status: 'SUCCEEDED',
          provider: 'sslcommerz',
          providerTransactionId: `refund:${proof.reference}`,
          idempotencyKey: `ssl-refund:${refund.id}`,
          amount: refund.amount,
          currency: original.currency,
          reference: proof.reference,
          receivedAt: new Date(),
          verifiedAt: new Date(),
        },
      });
      await tx.sslRefund.update({
        where: { id: refund.id },
        data: {
          providerReference: proof.reference,
          state: 'SUCCEEDED',
          paymentId: payment.id,
        },
      });
      if (checkout.appliedToInvoice) {
        const amountPaid = invoice.amountPaid - refund.amount;
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            amountPaid,
            balanceDue: invoice.balanceDue + refund.amount,
            status: amountPaid === 0n ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          },
        });
      }
      const complete = await tx.sslRefund.aggregate({
        where: { checkoutId: checkout.id, state: 'SUCCEEDED' },
        _sum: { amount: true },
      });
      if (
        !checkout.appliedToInvoice &&
        complete._sum.amount === original.amount
      ) {
        await tx.sslCheckout.update({
          where: { id: checkout.id },
          data: { reviewReason: null },
        });
        await tx.payment.update({
          where: { id: original.id },
          data: { failureReason: null },
        });
      }
      await sslAudit(
        tx,
        'SSL_REFUND_CONFIRMED',
        checkout.id,
        actor.identity.userId,
        {
          refundId: refund.id,
          paymentId: payment.id,
          originalPaymentId: original.id,
          amount: refund.amount.toString(),
          appliedToInvoice: checkout.appliedToInvoice,
        },
      );
    });
  }
  private async assertMfa(actor: AuthRequestContext) {
    this.checkouts.assertAdmin(actor);
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: actor.sessionId,
        userId: actor.identity.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        twoFactorVerifiedAt: { gte: new Date(Date.now() - 15 * 60000) },
        user: {
          role: 'ADMIN',
          status: 'ACTIVE',
          deletedAt: null,
          adminProfile: { is: { staffRole: 'FULL_ADMINISTRATOR' } },
          adminTotpCredential: { is: { enabledAt: { not: null } } },
        },
      },
      select: { id: true },
    });
    if (!session)
      throw sslProblem(
        'Sign in with two-step verification again before approving or reviewing a refund.',
        403,
      );
  }
}
