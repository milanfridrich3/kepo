/**
 * iCalendar (RFC 5545) builder for the read-only calendar feed. Pure, no I/O.
 * All-day events only (DATE values), CRLF line ends, text escaped, lines folded at 75 octets.
 */

export interface CalendarEvent {
  uid: string;
  /** YYYY-MM-DD */
  date: string;
  summary: string;
  description?: string;
}

export function escapeIcsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/** Fold a content line at 75 octets without splitting a UTF-8 character; continuation lines start with one space. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = ''; let curBytes = 0; let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (curBytes + n > limit) { parts.push(cur); cur = ''; curBytes = 0; limit = 74; }
    cur += ch; curBytes += n;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

const compact = (d: string) => d.replace(/-/g, '');
function nextDay(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day + 1)).toISOString().slice(0, 10);
}
const stamp = (now: Date) => now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

export function buildIcs(events: CalendarEvent[], calendarName: string, now: Date): string {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kepo//Calendar feed//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
  ];
  for (const e of events) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue; // never emit a malformed date
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${compact(nextDay(e.date))}`,
      `SUMMARY:${escapeIcsText(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeIcsText(e.description)}`);
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
