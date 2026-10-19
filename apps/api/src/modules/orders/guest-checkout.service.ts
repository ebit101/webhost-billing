import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { type PrismaClient } from '@webhost-billing/database';
import {
  type GuestHostingCheckoutRequest,
  type OrderCreationResult,
} from '@webhost-billing/shared';
import type { SecurityRequestContext } from '../../common/http/request-context';
import { ApplicationException } from '../../common/errors/application.exception';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import { AuthService } from '../auth/services/auth.service';
import { PasswordHasherService } from '../auth/services/password-hasher.service';
import { OrderService } from './order.service';

@Injectable()
export class GuestCheckoutService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly auth: AuthService,
    private readonly passwords: PasswordHasherService,
    private readonly orders: OrderService,
  ) {}

  async place(
    input: GuestHostingCheckoutRequest,
    context: SecurityRequestContext,
  ): Promise<OrderCreationResult> {
    const duplicate = await this.verifiedDuplicate(input);
    if (duplicate) return duplicate;

    const {
      domainChoice: _domainChoice,
      productId,
      priceId,
      requestedDomain,
      submissionKey,
      ...registration
    } = input;
    void _domainChoice;

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const account = await this.auth.register(
            registration,
            context,
            undefined,
            transaction,
          );
          return this.orders.create(
            {
              customerId: account.customerId,
              productId,
              priceId,
              requestedDomain,
              submissionKey,
            },
            { identity: { userId: account.userId } },
            context,
            'CUSTOMER',
            { transaction, allowPendingVerification: true },
          );
        },
        { timeout: 15_000 },
      );
    } catch (error) {
      const racedDuplicate = await this.verifiedDuplicate(input);
      if (racedDuplicate) return racedDuplicate;
      throw error;
    }
  }

  private async verifiedDuplicate(
    input: GuestHostingCheckoutRequest,
  ): Promise<OrderCreationResult | null> {
    const duplicate = await this.orders.guestDuplicate(input);
    if (!duplicate) return null;
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { passwordHash: true, customer: { select: { id: true } } },
    });
    if (
      !user ||
      user.customer?.id !== duplicate.order.customerId ||
      !user.passwordHash ||
      !(await this.passwords.verify(user.passwordHash, input.password))
    ) {
      throw new ApplicationException({
        status: HttpStatus.CONFLICT,
        code: 'CONFLICT',
        message: 'This checkout cannot be resumed with the supplied details.',
      });
    }
    return duplicate;
  }
}
