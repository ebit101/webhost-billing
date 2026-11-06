import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  purgeExpiredTicketAttachments,
  type PrismaClient,
} from '@webhost-billing/database';
import { WORKER_PRISMA } from './infrastructure/database.module';

@Injectable()
export class TicketAttachmentRetentionService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(TicketAttachmentRetentionService.name);
  private timer?: NodeJS.Timeout;
  private active?: Promise<void>;
  constructor(@Inject(WORKER_PRISMA) private readonly prisma: PrismaClient) {}
  onApplicationBootstrap() {
    this.timer = setInterval(() => this.tick(), 60000);
    this.tick();
  }
  async onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    await this.active;
  }
  private tick() {
    if (this.active) return;
    this.active = purgeExpiredTicketAttachments(this.prisma)
      .then(() => undefined)
      .catch(() => {
        this.logger.error(
          JSON.stringify({ event: 'ticket_attachment_retention_failed' }),
        );
      })
      .finally(() => {
        this.active = undefined;
      });
  }
}
