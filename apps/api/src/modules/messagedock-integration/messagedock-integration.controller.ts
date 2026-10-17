import { timingSafeEqual } from 'node:crypto';
import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import type { PrismaClient } from '@webhost-billing/database';
import type { Request } from 'express';
import { ApplicationException } from '../../common/errors/application.exception';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import { Public } from '../auth/decorators/public.decorator';

function authorized(
  header: string | undefined,
  secret: string | undefined,
): boolean {
  if (!secret || !header?.startsWith('Bearer ')) return false;
  const candidate = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}

@Controller('integrations/messagedock')
@Public()
export class MessageDockIntegrationController {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  private requireKey(request: Request): void {
    if (
      !authorized(
        request.get('authorization'),
        this.environment.MESSAGEDOCK_READ_TOKEN,
      )
    ) {
      throw new ApplicationException({
        status: HttpStatus.UNAUTHORIZED,
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Integration authentication is required.',
      });
    }
  }

  @Get('customers')
  async search(@Req() request: Request, @Query('q') query: unknown) {
    this.requireKey(request);
    const term = typeof query === 'string' ? query.trim() : '';
    if (term.length < 3 || term.length > 100) {
      throw new ApplicationException({
        status: HttpStatus.BAD_REQUEST,
        code: 'BAD_REQUEST',
        message: 'Search must contain 3 to 100 characters.',
      });
    }
    const customers = await this.prisma.customer.findMany({
      where: {
        deletedAt: null,
        OR: [
          { customerNumber: { contains: term, mode: 'insensitive' } },
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
          { companyName: { contains: term, mode: 'insensitive' } },
          { user: { email: { contains: term, mode: 'insensitive' } } },
        ],
      },
      select: {
        id: true,
        customerNumber: true,
        firstName: true,
        lastName: true,
        companyName: true,
        user: { select: { email: true } },
      },
      orderBy: [{ customerNumber: 'asc' }, { id: 'asc' }],
      take: 10,
    });
    return {
      customers: customers.map(({ user, ...customer }) => ({
        ...customer,
        email: user.email,
      })),
    };
  }

  @Get('customers/:customerId/context')
  async context(
    @Req() request: Request,
    @Param('customerId') customerId: string,
  ) {
    this.requireKey(request);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        customerId,
      )
    ) {
      throw new ApplicationException({
        status: HttpStatus.BAD_REQUEST,
        code: 'BAD_REQUEST',
        message: 'Invalid customer identifier.',
      });
    }
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: {
        id: true,
        customerNumber: true,
        firstName: true,
        lastName: true,
        companyName: true,
        services: {
          select: {
            id: true,
            productNameSnapshot: true,
            domain: true,
            status: true,
            nextDueAt: true,
          },
          orderBy: [{ nextDueAt: 'asc' }, { id: 'asc' }],
          take: 20,
        },
        invoices: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            currency: true,
            balanceDue: true,
            dueAt: true,
          },
          orderBy: [{ dueAt: 'desc' }, { id: 'desc' }],
          take: 20,
        },
        tickets: {
          select: {
            id: true,
            ticketNumber: true,
            subject: true,
            status: true,
            priority: true,
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: 20,
        },
      },
    });
    if (!customer) {
      throw new ApplicationException({
        status: HttpStatus.NOT_FOUND,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Customer not found.',
      });
    }
    return {
      customer: {
        ...customer,
        invoices: customer.invoices.map((invoice) => ({
          ...invoice,
          balanceDue: invoice.balanceDue.toString(),
        })),
      },
    };
  }
}
