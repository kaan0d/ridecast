// iCalendar (RFC 5545) export of a trip: one event per riding day.

export interface CalendarEvent {
  uid: string;
  startMs: number;
  endMs: number;
  summary: string;
  description?: string;
  location?: string;
}

// Text values escape backslash, semicolon, comma and newlines (RFC 5545 3.3.11).
const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// UTC date-time, e.g. 20260925T050000Z.
const utc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

// Lines longer than 75 octets continue on the next line after CRLF and a space (3.1), never
// splitting a UTF-8 character.
function fold(line: string): string {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + n > limit) {
      parts.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

export function toIcs(events: CalendarEvent[], stampMs: number): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ridecast//route weather//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${utc(stampMs)}`,
      `DTSTART:${utc(e.startMs)}`,
      `DTEND:${utc(e.endMs)}`,
      `SUMMARY:${escapeText(e.summary)}`,
    );
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
