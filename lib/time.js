// Time-zone helpers built on Intl, so the server's own zone (UTC on Vercel) never leaks in.

const formatters = new Map();

function formatter(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat("en-GB", {
      timeZone, hourCycle: "h23", weekday: "short", year: "numeric", month: "numeric",
      day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
    }));
  }
  return formatters.get(timeZone);
}

export function isTimeZone(timeZone) {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function localParts(date, timeZone) {
  const parts = {};
  for (const {type, value} of formatter(timeZone).formatToParts(date)) parts[type] = value;
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
    weekday: parts.weekday,
  };
}

function offsetMs(instant, timeZone) {
  const p = localParts(new Date(instant), timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000;
}

// Wall-clock time in a zone -> instant. Two passes settle DST transitions.
export function zonedToInstant({year, month, day, hour = 0, minute = 0, second = 0}, timeZone) {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = wall - offsetMs(wall, timeZone);
  instant = wall - offsetMs(instant, timeZone);
  return new Date(instant);
}

export function dayBounds(now, timeZone) {
  const {year, month, day} = localParts(now, timeZone);
  return {
    start: zonedToInstant({year, month, day}, timeZone),
    end: zonedToInstant({year, month, day: day + 1}, timeZone),
  };
}

export function clockLabel(date, timeZone) {
  const p = localParts(date, timeZone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dateLabel(date, timeZone) {
  const p = localParts(date, timeZone);
  return `${p.weekday} ${p.day} ${MONTHS[p.month - 1]}`;
}
