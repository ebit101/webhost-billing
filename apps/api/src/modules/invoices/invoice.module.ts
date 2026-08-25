import { Module } from '@nestjs/common';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { InvoicePdfService } from './invoice-pdf.service';

@Module({
  controllers: [InvoiceController],
  providers: [InvoiceService, InvoicePdfService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
