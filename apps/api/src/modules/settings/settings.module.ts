import { Module } from '@nestjs/common';
import { IntegrationCredentialCipher } from './integration-credential.cipher';
import { IntegrationCredentialService } from './integration-credential.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [SettingsController],
  providers: [
    IntegrationCredentialCipher,
    IntegrationCredentialService,
    SettingsService,
  ],
  exports: [IntegrationCredentialService, SettingsService],
})
export class SettingsModule {}
