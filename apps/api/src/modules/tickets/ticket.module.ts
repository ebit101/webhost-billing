import { TicketAttachmentController } from './ticket-attachment.controller';
import { TicketAttachmentService } from './ticket-attachment.service';
import { Module } from '@nestjs/common';
import { TicketController } from './ticket.controller';
import { TicketService } from './ticket.service';

@Module({
  controllers: [TicketAttachmentController, TicketController],
  providers: [TicketService, TicketAttachmentService],
})
export class TicketModule {}
