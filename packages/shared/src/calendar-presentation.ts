/** Presentation only: API values and calendar arithmetic keep ISO dates. */
export function formatCalendarDate(value: string | null | undefined): string {
  if (!value) return '—';
  const iso = value.slice(0, 10);
  if (!validIsoDate(iso)) return '—';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

export function parseCalendarDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  return validIsoDate(iso) ? iso : null;
}

export function parseCalendarDateTime(value: string): string | null {
  const match = /^(\d{2}\/\d{2}\/\d{4}) (\d{2}):(\d{2})$/.exec(value);
  if (!match || Number(match[2]) > 23 || Number(match[3]) > 59) return null;
  const date = parseCalendarDate(match[1]);
  return date ? `${date}T${match[2]}:${match[3]}` : null;
}

/** Replace raw ISO timestamp labels while retaining their explicit UTC meaning. */
export function formatUtcTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' }).format(date)} UTC`;
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
