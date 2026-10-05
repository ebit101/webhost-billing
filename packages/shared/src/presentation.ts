/** Human labels only: never apply this to identifiers, submitted values or user content. */
export function sentenceCaseLabel(value: string): string {
  if (!/^[A-Z][A-Z0-9_ -]*$/.test(value)) return value;
  const words = value.replaceAll('_', ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
