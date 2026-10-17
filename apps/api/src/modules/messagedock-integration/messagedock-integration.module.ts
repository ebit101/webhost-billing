import { Module } from '@nestjs/common';
import { MessageDockIntegrationController } from './messagedock-integration.controller';

@Module({ controllers: [MessageDockIntegrationController] })
export class MessageDockIntegrationModule {}
