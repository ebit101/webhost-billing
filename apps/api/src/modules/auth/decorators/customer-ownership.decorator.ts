import { SetMetadata } from '@nestjs/common';

export const CUSTOMER_OWNERSHIP_PARAM_KEY = 'auth:customer-ownership-param';
export const RequireCustomerOwnership = (parameterName: string) =>
  SetMetadata(CUSTOMER_OWNERSHIP_PARAM_KEY, parameterName);
