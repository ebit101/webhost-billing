export function csvDocument(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function csvCell(value: unknown): string {
  let text =
    value instanceof Date
      ? value.toISOString()
      : value == null
        ? ''
        : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
