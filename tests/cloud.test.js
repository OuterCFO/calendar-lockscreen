import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createCanvas, loadImage} from "@napi-rs/canvas";
import {eventsBetween, remainingToday} from "../lib/calendar.js";
import {dayBounds, zonedToInstant, clockLabel} from "../lib/time.js";
import {appearance, buildWallpaper, readConfig} from "../lib/wallpaper.js";
import {handle} from "../api/wallpaper.js";

const ics = readFileSync(new URL("./fixtures/sample.ics", import.meta.url), "utf8");
const timeZone = "Europe/Paris";
const now = zonedToInstant({year: 2026, month: 11, day: 20, hour: 9, minute: 41}, timeZone);
const env = {
  ICS_URLS: "https://calendar.example/one.ics", TIME_ZONE: timeZone,
  LATITUDE: "48.8566", LONGITUDE: "2.3522", SELF_EMAILS: "me@example.com",
  WALLPAPER_KEY: "0123456789abcdef0123",
};
const feed = text => async () => new Response(text, {status: 200});

function today(text = ics, selfEmails = ["me@example.com"]) {
  const {start, end} = dayBounds(now, timeZone);
  return remainingToday(eventsBetween(text, start, end, {timeZone, selfEmails}), now, end);
}

test("day bounds follow the configured zone, not the server zone", () => {
  const {start, end} = dayBounds(now, timeZone);
  assert.equal(start.toISOString(), "2026-11-19T23:00:00.000Z");
  assert.equal(end.toISOString(), "2026-11-20T23:00:00.000Z");
  const summer = dayBounds(zonedToInstant({year: 2026, month: 7, day: 1, hour: 12}, timeZone), timeZone);
  assert.equal(summer.start.toISOString(), "2026-06-30T22:00:00.000Z");
  const dst = dayBounds(zonedToInstant({year: 2026, month: 3, day: 29, hour: 12}, timeZone), timeZone);
  assert.equal(dst.end - dst.start, 23 * 3600 * 1000);
});

test("today's remaining events: recurrences, moves, cancellations, declines, all-day", () => {
  const events = today();
  assert.deepEqual(events.map(e => [e.title, e.isAllDay ? "all day" : clockLabel(e.startDate, timeZone)]), [
    ["Morning focus", "09:00"],
    ["Coffee with Sarah", "11:00"],
    ["Weekly review (moved to today)", "17:00"],
    ["Floating late call", "21:30"],
    ["Mum's birthday", "all day"],
  ]);
  assert.equal(events[1].location, "The corner café");
  assert.equal(events[0].calendar.title, "Work");
});

test("declined events stay visible when SELF_EMAILS is not set", () => {
  assert(today(ics, []).some(e => e.title === "Declined meeting"));
});

test("sunrise and sunset choose the palette; overrides win", () => {
  const paris = {latitude: 48.8566, longitude: 2.3522};
  assert.equal(appearance("auto", new Date("2026-11-20T12:00:00Z"), paris), "light");
  assert.equal(appearance("auto", new Date("2026-11-20T18:00:00Z"), paris), "dark");
  assert.equal(appearance("auto", new Date("2026-06-21T22:00:00Z"), {latitude: 78.22, longitude: 15.65}), "light");
  assert.equal(appearance("night", new Date("2026-11-20T12:00:00Z"), paris), "dark");
  assert.equal(appearance("day", new Date("2026-11-20T23:00:00Z"), paris), "light");
});

test("renders a full-size PNG with the right palette", async () => {
  const config = readConfig(env);
  const {png, theme, count} = await buildWallpaper({config, now, fetchImpl: feed(ics)});
  assert.equal(theme, "light");
  assert.equal(count, 5);
  const image = await loadImage(png);
  assert.equal(image.width, 1170);
  assert.equal(image.height, 2532);
  const ctx = createCanvas(1, 1).getContext("2d");
  ctx.drawImage(image, -5, -5);
  assert(ctx.getImageData(0, 0, 1, 1).data[0] > 200);
  const night = await buildWallpaper({config, now, mode: "night", fetchImpl: feed(ics)});
  const dark = await loadImage(night.png);
  ctx.drawImage(dark, -5, -5);
  assert(ctx.getImageData(0, 0, 1, 1).data[0] < 30);
});

test("more events than rows still renders, with an overflow line", async () => {
  const many = ics.replace("END:VCALENDAR", Array.from({length: 10}, (_, i) =>
    `BEGIN:VEVENT\nUID:extra-${i}\nDTSTART;TZID=Europe/Paris:20261120T${String(10 + i).padStart(2, "0")}3000\nDTEND;TZID=Europe/Paris:20261120T${String(10 + i).padStart(2, "0")}4500\nSUMMARY:Extra ${i}\nEND:VEVENT`).join("\n") + "\nEND:VCALENDAR");
  const {count} = await buildWallpaper({config: readConfig(env), now, fetchImpl: feed(many)});
  assert.equal(count, 15);
});

test("HTTP: key required, bad feeds fail closed, success returns PNG", async (t) => {
  t.mock.method(console, "error", () => {});
  const request = query => new Request("https://wall.example/api/wallpaper" + query);
  assert.equal((await handle(request(""), env)).status, 401);
  assert.equal((await handle(request("?key=wrong"), env)).status, 401);
  assert.equal((await handle(request(`?key=${env.WALLPAPER_KEY}&mode=noon`), env)).status, 400);
  assert.equal((await handle(request(`?key=${env.WALLPAPER_KEY}`), {...env, TIME_ZONE: "Mars/Base"})).status, 500);
  const down = await handle(request(`?key=${env.WALLPAPER_KEY}`), env, {fetchImpl: async () => new Response("nope", {status: 404})});
  assert.equal(down.status, 502);
  const notCalendar = await handle(request(`?key=${env.WALLPAPER_KEY}`), env, {fetchImpl: feed("<html>")});
  assert.equal(notCalendar.status, 502);
  const ok = await handle(request(`?key=${env.WALLPAPER_KEY}&mode=day`), env, {fetchImpl: feed(ics), now});
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "image/png");
  assert.equal(ok.headers.get("cache-control"), "no-store");
});
