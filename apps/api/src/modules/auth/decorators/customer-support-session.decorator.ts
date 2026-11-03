import { SetMetadata } from '@nestjs/common';

export const CUSTOMER_SUPPORT_ACCESS_KEY = 'customer-support-access';
export const CustomerSupportAccess = (access: 'read' | 'end' = 'read') =>
  SetMetadata(CUSTOMER_SUPPORT_ACCESS_KEY, access);
