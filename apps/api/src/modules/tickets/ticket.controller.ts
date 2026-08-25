import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { ApiEnvironment } from '@webhost-billing/config';
import {
  createApiSuccessResponse,
  createPaginatedApiSuccessResponse,
  createTicketRequestSchema,
  myTicketListQuerySchema,
  replyToTicketRequestSchema,
  ticketListQuerySchema,
  updateTicketRequestSchema,
  type CreateTicketRequest,
  type MyTicketListQuery,
  type ReplyToTicketRequest,
  type TicketListQuery,
  type UpdateTicketRequest,
} from '@webhost-billing/shared';
import type { Request } from 'express';
import { createSecurityRequestContext } from '../../common/http/request-context';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { API_ENVIRONMENT } from '../../infrastructure/environment/environment.module';
import type { AuthRequestContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { AuthRateLimit } from '../auth/decorators/rate-limit.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { TicketService } from './ticket.service';

@Controller('tickets')
export class TicketController {
  private readonly auditSecret: string;

  constructor(
    private readonly tickets: TicketService,
    @Inject(API_ENVIRONMENT) environment: ApiEnvironment,
  ) {
    this.auditSecret = environment.SESSION_SECRET;
  }

  @Get('setup-options')
  @Roles('ADMIN')
  async setupOptions() {
    return createApiSuccessResponse(await this.tickets.setupOptions());
  }

  @Get('my')
  @Roles('CUSTOMER')
  async myTickets(
    @Query(new ZodValidationPipe(myTicketListQuerySchema))
    query: MyTicketListQuery,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    if (auth.identity.role !== 'CUSTOMER') throw new Error('Unreachable role');
    const result = await this.tickets.list({
      ...query,
      customerId: auth.identity.customerId,
      unassigned: false,
    });
    return createPaginatedApiSuccessResponse(result.data, result.pagination);
  }

  @Get()
  @Roles('ADMIN')
  async list(
    @Query(new ZodValidationPipe(ticketListQuerySchema))
    query: TicketListQuery,
  ) {
    const result = await this.tickets.list(query);
    return createPaginatedApiSuccessResponse(result.data, result.pagination);
  }

  @Post()
  @Roles('CUSTOMER')
  @AuthRateLimit({
    scope: 'ticket-create',
    limit: 10,
    windowMs: 15 * 60_000,
    includeEmail: false,
  })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createTicketRequestSchema))
    input: CreateTicketRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.tickets.create(input, auth, this.context(request)),
    );
  }

  @Get(':ticketId')
  @Roles('ADMIN', 'CUSTOMER')
  async detail(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @CurrentAuth() auth: AuthRequestContext,
  ) {
    return createApiSuccessResponse(await this.tickets.get(ticketId, auth));
  }

  @Post(':ticketId/replies')
  @Roles('ADMIN', 'CUSTOMER')
  @AuthRateLimit({
    scope: 'ticket-reply',
    limit: 60,
    windowMs: 15 * 60_000,
    includeEmail: false,
  })
  @HttpCode(HttpStatus.CREATED)
  async reply(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Body(new ZodValidationPipe(replyToTicketRequestSchema))
    input: ReplyToTicketRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.tickets.reply(ticketId, input, auth, this.context(request)),
    );
  }

  @Patch(':ticketId')
  @Roles('ADMIN')
  async update(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Body(new ZodValidationPipe(updateTicketRequestSchema))
    input: UpdateTicketRequest,
    @CurrentAuth() auth: AuthRequestContext,
    @Req() request: Request,
  ) {
    return createApiSuccessResponse(
      await this.tickets.update(ticketId, input, auth, this.context(request)),
    );
  }

  private context(request: Request) {
    return createSecurityRequestContext(request, this.auditSecret);
  }
}
