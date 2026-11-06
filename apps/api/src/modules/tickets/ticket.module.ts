import { SupportEmailController } from './support-email.controller';
import { SupportEmailService } from './support-email.service';
import { TicketAttachmentController } from './ticket-attachment.controller';
import { TicketAttachmentService } from './ticket-attachment.service';
import { Module } from '@nestjs/common';
import { TicketController } from './ticket.controller';
import { TicketService } from './ticket.service';

@Module({
  controllers: [
    SupportEmailController,
    TicketAttachmentController,
    TicketController,
  ],
  providers: [SupportEmailService, TicketService, TicketAttachmentService],
})
export class TicketModule {}
