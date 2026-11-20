import ICAL from "ical.js";
import {isTimeZone, zonedToInstant} from "./time.js";

// How far past today we keep expanding a recurrence, so an occurrence moved
// into today from a later original date is still found.
const LOOKAHEAD_MS = 31 * 24 * 3600 * 1000;

function toInstant(time, fallbackZone) {
  if (!time.isDate && time.zone === ICAL.Timezone.utcTimezone) return time.toJSDate();
  const tzid = time.isDate ? fallbackZone : time.zone?.tzid || time.timezone;
  const zone = tzid && tzid !== "floating" && isTimeZone(tzid) ? tzid : fallbackZone;
  return zonedToInstant({
    year: time.year, month: time.month, day: time.day,
    hour: time.isDate ? 0 : time.hour, minute: time.isDate ? 0 : time.minute, second: time.isDate ? 0 : time.second,
  }, zone);
}

function declinedBy(component, selfEmails) {
  if (!selfEmails.length) return false;
  return component.getAllProperties("attendee").some(attendee => {
    const email = String(attendee.getFirstValue() || "").replace(/^mailto:/i, "").toLowerCase();
    return selfEmails.includes(email) && String(attendee.getParameter("partstat") || "").toUpperCase() === "DECLINED";
  });
}

function occurrence(component, start, end, calendar, timeZone, selfEmails) {
  if (String(component.getFirstPropertyValue("status") || "").toUpperCase() === "CANCELLED") return null;
  if (declinedBy(component, selfEmails)) return null;
  const isAllDay = start.isDate;
  return {
    title: String(component.getFirstPropertyValue("summary") || ""),
    location: String(component.getFirstPropertyValue("location") || ""),
    startDate: toInstant(start, timeZone),
    endDate: toInstant(end, timeZone),
    isAllDay,
    calendar,
  };
}

/**
 * Events from one iCalendar feed that overlap [from, to).
 * Recurrences are expanded; moved, cancelled and deleted occurrences are honoured.
 */
export function eventsBetween(icsText, from, to, {timeZone, selfEmails = [], fallbackTitle = "Calendar"}) {
  const root = new ICAL.Component(ICAL.parse(icsText));
  for (const vtimezone of root.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(vtimezone);
  const title = String(root.getFirstPropertyValue("x-wr-calname") || fallbackTitle);
  const calendar = {identifier: title, title};
  const emails = selfEmails.map(email => email.toLowerCase());

  const byUid = new Map();
  for (const component of root.getAllSubcomponents("vevent")) {
    const uid = component.getFirstPropertyValue("uid") || Symbol("no-uid");
    if (!byUid.has(uid)) byUid.set(uid, {master: null, exceptions: []});
    const group = byUid.get(uid);
    if (component.hasProperty("recurrence-id")) group.exceptions.push(component);
    else group.master = component;
  }

  const results = [];
  const overlaps = item => item && item.startDate < to && item.endDate > from;
  for (const {master, exceptions} of byUid.values()) {
    if (!master) {
      // Orphan overrides (master outside the feed): treat each as a single event.
      for (const component of exceptions) {
        const event = new ICAL.Event(component);
        const item = occurrence(component, event.startDate, event.endDate, calendar, timeZone, emails);
        if (overlaps(item)) results.push(item);
      }
      continue;
    }
    const event = new ICAL.Event(master);
    if (!event.startDate) continue;
    if (!event.isRecurring()) {
      const item = occurrence(master, event.startDate, event.endDate || event.startDate, calendar, timeZone, emails);
      if (overlaps(item)) results.push(item);
      continue;
    }
    for (const component of exceptions) event.relateException(new ICAL.Event(component));
    const iterator = event.iterator();
    const stopAfter = to.getTime() + LOOKAHEAD_MS;
    for (let next = iterator.next(); next; next = iterator.next()) {
      if (toInstant(next, timeZone).getTime() > stopAfter) break;
      const details = event.getOccurrenceDetails(next);
      const item = occurrence(details.item.component, details.startDate, details.endDate, calendar, timeZone, emails);
      if (overlaps(item)) results.push(item);
    }
  }
  return results;
}

// Today's events still worth showing: unfinished, timed first, then all-day.
export function remainingToday(events, now, dayEnd) {
  return events
    .filter(event => event.startDate < dayEnd && event.endDate > now)
    .sort((a, b) => Number(a.isAllDay) - Number(b.isAllDay) || a.startDate - b.startDate || a.title.localeCompare(b.title));
}
