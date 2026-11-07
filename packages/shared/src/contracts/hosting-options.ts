import { z } from 'zod';

export const MAX_HOSTING_OPTION_CHOICES = 20;
export const hostingConfigurationChoiceSchema = z
  .object({
    version: z.literal(1),
    groupKey: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[a-z][a-z0-9-]*$/),
    groupName: z.string().trim().min(1).max(60),
    choiceName: z.string().trim().min(1).max(60),
    fulfillment: z.literal('MANUAL'),
    fulfillmentNote: z.string().trim().min(1).max(500),
  })
  .strict();
export type HostingConfigurationChoice = z.infer<
  typeof hostingConfigurationChoiceSchema
>;

/** Old provider JSON is untouched; a malformed explicit option fails closed. */
export function readHostingConfiguration(
  value: unknown,
): HostingConfigurationChoice | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return (
    z
      .object({ hostingOption: hostingConfigurationChoiceSchema.nullish() })
      .passthrough()
      .parse(value).hostingOption ?? null
  );
}
export function distinctHostingOptionGroups(
  configurations: (HostingConfigurationChoice | null)[],
): boolean {
  const keys = configurations.flatMap((value) =>
    value ? [value.groupKey] : [],
  );
  return keys.length === new Set(keys).size;
}
export function hostingOptionName(
  configuration: HostingConfigurationChoice,
): string {
  return `${configuration.groupName}: ${configuration.choiceName}`;
}
