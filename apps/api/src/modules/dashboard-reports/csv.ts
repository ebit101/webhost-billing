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
        : typeof value === 'string'
          ? value
          : typeof value === 'number' ||
              typeof value === 'bigint' ||
              typeof value === 'boolean'
            ? String(value)
            : (JSON.stringify(value) ?? '');
  let first = 0;
  while (
    first < text.length &&
    (text.charCodeAt(first) <= 32 || text[first].trim() === '')
  )
    first += 1;
  if (
    (text.length > 0 && text.charCodeAt(0) < 32) ||
    /^[=+\-@]/u.test(text.slice(first))
  )
    text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
