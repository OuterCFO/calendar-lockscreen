import SunCalc from "suncalc";
import {eventsBetween, remainingToday} from "./calendar.js";
import {renderWallpaper, LIGHT_THEME, DARK_THEME} from "./render.js";
import {dayBounds, isTimeZone} from "./time.js";

export class ConfigError extends Error {}

export function readConfig(env) {
  const icsUrls = String(env.ICS_URLS || "").split(/\s+/).filter(Boolean);
  if (!icsUrls.length) throw new ConfigError("ICS_URLS is not set.");
  for (const url of icsUrls) {
    if (!/^https:\/\//i.test(url)) throw new ConfigError("Every ICS_URLS entry must start with https://.");
  }
  const timeZone = String(env.TIME_ZONE || "");
  if (!isTimeZone(timeZone)) throw new ConfigError("TIME_ZONE must be an IANA zone such as Europe/Paris.");
  const latitude = Number(env.LATITUDE), longitude = Number(env.LONGITUDE);
  if (!(Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) || env.LATITUDE === undefined || env.LONGITUDE === undefined) {
    throw new ConfigError("LATITUDE and LONGITUDE must be set to decimal degrees.");
  }
  const selfEmails = String(env.SELF_EMAILS || "").split(/[\s,]+/).filter(Boolean);
  return {icsUrls, timeZone, latitude, longitude, selfEmails};
}

// Day palette while the sun is above the standard sunrise/sunset horizon.
export function appearance(mode, now, {latitude, longitude}) {
  if (mode === "day") return "light";
  if (mode === "night") return "dark";
  const altitude = SunCalc.getPosition(now, latitude, longitude).altitude;
  return altitude >= -0.833 * Math.PI / 180 ? "light" : "dark";
}

async function fetchFeed(url, fetchImpl) {
  const response = await fetchImpl(url, {signal: AbortSignal.timeout(8000), headers: {accept: "text/calendar"}});
  if (!response.ok) throw new Error(`A calendar feed returned HTTP ${response.status}.`);
  const text = await response.text();
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("A calendar feed did not return iCalendar data.");
  return text;
}

export async function buildWallpaper({config, now = new Date(), mode = "auto", fetchImpl = fetch}) {
  const {start, end} = dayBounds(now, config.timeZone);
  // Fail closed: a missing calendar must not produce a wallpaper that looks complete.
  const feeds = await Promise.all(config.icsUrls.map(url => fetchFeed(url, fetchImpl)));
  const events = feeds.flatMap((text, index) => eventsBetween(text, start, end, {
    timeZone: config.timeZone, selfEmails: config.selfEmails, fallbackTitle: `Calendar ${index + 1}`,
  }));
  const remaining = remainingToday(events, now, end);
  const theme = appearance(mode, now, config) === "dark" ? DARK_THEME : LIGHT_THEME;
  const png = await renderWallpaper(remaining, now, {theme, timeZone: config.timeZone});
  return {png, theme: theme.mode, count: remaining.length};
}
