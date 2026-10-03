export interface AdminCustomerFilter {
  customerId?: string;
  invalid: boolean;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const emptyAdminCustomerFilter: AdminCustomerFilter = {
  invalid: false,
};

export function parseAdminCustomerFilter(
  value: string | string[] | undefined,
): AdminCustomerFilter {
  if (value === undefined) return emptyAdminCustomerFilter;
  if (Array.isArray(value) || !uuidPattern.test(value)) {
    return { invalid: true };
  }
  return { customerId: value, invalid: false };
}

export function withAdminCustomerFilter(
  path: string,
  filter: AdminCustomerFilter,
): string {
  if (!filter.customerId) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}customerId=${encodeURIComponent(filter.customerId)}`;
}

export function adminCustomerFilterHref(
  path: string,
  customerId: string,
): string {
  return withAdminCustomerFilter(path, {
    customerId,
    invalid: false,
  });
}
