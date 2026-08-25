import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApiExceptionFilter } from './common/errors/api-exception.filter';
import { EnvironmentModule } from './infrastructure/environment/environment.module';
import { AuthModule } from './modules/auth/auth.module';
import { CustomerModule } from './modules/customers/customer.module';
import { InvoiceModule } from './modules/invoices/invoice.module';
import { OrderModule } from './modules/orders/order.module';
import { PaymentModule } from './modules/payments/payment.module';
import { PaymentGatewayModule } from './modules/payment-gateways/payment-gateway.module';
import { ProductModule } from './modules/products/product.module';
import { ServiceModule } from './modules/services/service.module';
import { HostingPanelModule } from './modules/hosting-panels/hosting-panel.module';
import { BackgroundJobModule } from './modules/background-jobs/background-job.module';
import { EmailNotificationModule } from './modules/email-notifications/email-notification.module';
import { RenewalAutomationModule } from './modules/renewal-automation/renewal-automation.module';
import { TicketModule } from './modules/tickets/ticket.module';
import { SettingsModule } from './modules/settings/settings.module';

@Module({
  imports: [
    EnvironmentModule,
    AuthModule,
    CustomerModule,
    ProductModule,
    OrderModule,
    InvoiceModule,
    PaymentModule,
    PaymentGatewayModule,
    ServiceModule,
    HostingPanelModule,
    BackgroundJobModule,
    EmailNotificationModule,
    RenewalAutomationModule,
    TicketModule,
    SettingsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
  ],
})
export class AppModule {}
