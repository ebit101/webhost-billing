import { Module } from '@nestjs/common';
import { DomainController } from './domain.controller';
import { DomainService } from './domain.service';
import { DomainLifecycleService } from './domain-lifecycle.service';
import { DomainAdministrationService } from './domain-administration.service';
import { DomainAdministrationController } from './domain-administration.controller';
import { ExistingDomainLinkService } from './existing-domain-link.service';
import { DomainInventoryService } from './domain-inventory.service';
import { DomainFactsService } from './domain-facts.service';
import { DomainRenewalsService } from './domain-renewals.service';
import { DomainRenewalExecutionService } from './domain-renewal-execution.service';
@Module({
  controllers: [DomainController, DomainAdministrationController],
  providers: [
    DomainService,
    DomainLifecycleService,
    DomainAdministrationService,
    ExistingDomainLinkService,
    DomainInventoryService,
    DomainFactsService,
    DomainRenewalsService,
    DomainRenewalExecutionService,
  ],
  exports: [DomainService],
})
export class DomainModule {}
