/**
 * Dates as the app uses them in URLs and API calls: "YYYY-MM-DD", computed in UTC.
 * playwright.config.ts pins the browser to UTC too, so test data and the UI always agree.
 */

export interface Stay {
  checkin: string;
  checkout: string;
  nights: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return isoDate(new Date());
}

export function addDays(iso: string, days: number): string {
  return isoDate(new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS));
}

/** A stay starting `startInDays` from today. With a freshRoom any dates are free, so keep it simple. */
export function futureStay({ startInDays = 7, nights = 3 } = {}): Stay {
  const checkin = addDays(todayIso(), startInDays);
  return { checkin, checkout: addDays(checkin, nights), nights };
}

/** "2026-10-20" → "20/10/2026", the en-GB format the home page date pickers display and accept. */
export function toUkDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

/** Whole calendar months from `fromIso` to `toIso` (e.g. 2026-10-31 → 2026-11-01 is 1). */
export function monthsBetween(fromIso: string, toIso: string): number {
  const [fromYear, fromMonth] = fromIso.split('-').map(Number) as [number, number];
  const [toYear, toMonth] = toIso.split('-').map(Number) as [number, number];
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

/** "2026-10-20" plus `offset` months → "October 2026" style label, as calendar toolbars show it. */
export function monthLabel(iso: string, offset = 0): string {
  const [year, month] = iso.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
