// Scriptable: Calendar Wallpaper
// Run once in Scriptable to grant access and select your Google calendars.
// Shortcuts receives a PNG file. Connect Output directly to Get Images from Input.

const SETTINGS = {
  calendarSelectionFile: "calendar-lockscreen-calendars.json",
  locationFile: "calendar-lockscreen-location.json",
  width: 1170,
  height: 2532,
  agendaTop: 306, // Logical points. Leave room for the native date and clock.
  agendaBottom: 680, // Reserve space for the update line above lock-screen controls.
  maxEvents: 8,
  showLocations: true,
};

const LIGHT_THEME = {
  mode: "light",
  background: "e4d4bd", bottom: "d6c2a5", ink: "343b35",
  muted: "746e60", border: "c7b89f", accents: ["ae8068", "748570", "7d8e9e"],
  arcs: "b9aa90", halo: "cdd0b8",
};
const DARK_THEME = {
  mode: "dark",
  background: "101512", bottom: "080b09", ink: "c8cabb",
  muted: "848b7f", border: "29322c", accents: ["b28c74", "92a387", "8c9ba6"],
  arcs: "61705b", halo: "293629",
};

// Solar calculations from SunCalc 1.9.0 (sun-only subset; bundled for offline use).
/*
Copyright (c) 2014, Vladimir Agafonkin
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are
permitted provided that the following conditions are met:

   1. Redistributions of source code must retain the above copyright notice, this list of
      conditions and the following disclaimer.

   2. Redistributions in binary form must reproduce the above copyright notice, this list
      of conditions and the following disclaimer in the documentation and/or other materials
      provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
/*
 (c) 2011-2015, Vladimir Agafonkin
 SunCalc is a JavaScript library for calculating sun/moon position and light phases.
 https://github.com/mourner/suncalc
*/

const Solar = (function () { 'use strict';

// shortcuts for easier to read formulas

var PI   = Math.PI,
    sin  = Math.sin,
    cos  = Math.cos,
    tan  = Math.tan,
    asin = Math.asin,
    atan = Math.atan2,
    acos = Math.acos,
    rad  = PI / 180;

// sun calculations are based on http://aa.quae.nl/en/reken/zonpositie.html formulas


// date/time constants and conversions

var dayMs = 1000 * 60 * 60 * 24,
    J1970 = 2440588,
    J2000 = 2451545;

function toJulian(date) { return date.valueOf() / dayMs - 0.5 + J1970; }
function fromJulian(j)  { return new Date((j + 0.5 - J1970) * dayMs); }
function toDays(date)   { return toJulian(date) - J2000; }


// general calculations for position

var e = rad * 23.4397; // obliquity of the Earth

function rightAscension(l, b) { return atan(sin(l) * cos(e) - tan(b) * sin(e), cos(l)); }
function declination(l, b)    { return asin(sin(b) * cos(e) + cos(b) * sin(e) * sin(l)); }

function azimuth(H, phi, dec)  { return atan(sin(H), cos(H) * sin(phi) - tan(dec) * cos(phi)); }
function altitude(H, phi, dec) { return asin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(H)); }

function siderealTime(d, lw) { return rad * (280.16 + 360.9856235 * d) - lw; }

function astroRefraction(h) {
    if (h < 0) // the following formula works for positive altitudes only.
        h = 0; // if h = -0.08901179 a div/0 would occur.

    // formula 16.4 of "Astronomical Algorithms" 2nd edition by Jean Meeus (Willmann-Bell, Richmond) 1998.
    // 1.02 / tan(h + 10.26 / (h + 5.10)) h in degrees, result in arc minutes -> converted to rad:
    return 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179));
}

// general sun calculations

function solarMeanAnomaly(d) { return rad * (357.5291 + 0.98560028 * d); }

function eclipticLongitude(M) {

    var C = rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M)), // equation of center
        P = rad * 102.9372; // perihelion of the Earth

    return M + C + P + PI;
}

function sunCoords(d) {

    var M = solarMeanAnomaly(d),
        L = eclipticLongitude(M);

    return {
        dec: declination(L, 0),
        ra: rightAscension(L, 0)
    };
}


var SunCalc = {};


// calculates sun position for a given date and latitude/longitude

SunCalc.getPosition = function (date, lat, lng) {

    var lw  = rad * -lng,
        phi = rad * lat,
        d   = toDays(date),

        c  = sunCoords(d),
        H  = siderealTime(d, lw) - c.ra;

    return {
        azimuth: azimuth(H, phi, c.dec),
        altitude: altitude(H, phi, c.dec)
    };
};


// sun times configuration (angle, morning name, evening name)

var times = SunCalc.times = [
    [-0.833, 'sunrise',       'sunset'      ],
    [  -0.3, 'sunriseEnd',    'sunsetStart' ],
    [    -6, 'dawn',          'dusk'        ],
    [   -12, 'nauticalDawn',  'nauticalDusk'],
    [   -18, 'nightEnd',      'night'       ],
    [     6, 'goldenHourEnd', 'goldenHour'  ]
];

// adds a custom time to the times config

SunCalc.addTime = function (angle, riseName, setName) {
    times.push([angle, riseName, setName]);
};


// calculations for sun times

var J0 = 0.0009;

function julianCycle(d, lw) { return Math.round(d - J0 - lw / (2 * PI)); }

function approxTransit(Ht, lw, n) { return J0 + (Ht + lw) / (2 * PI) + n; }
function solarTransitJ(ds, M, L)  { return J2000 + ds + 0.0053 * sin(M) - 0.0069 * sin(2 * L); }

function hourAngle(h, phi, d) { return acos((sin(h) - sin(phi) * sin(d)) / (cos(phi) * cos(d))); }
function observerAngle(height) { return -2.076 * Math.sqrt(height) / 60; }

// returns set time for the given sun altitude
function getSetJ(h, lw, phi, dec, n, M, L) {

    var w = hourAngle(h, phi, dec),
        a = approxTransit(w, lw, n);
    return solarTransitJ(a, M, L);
}


// calculates sun times for a given date, latitude/longitude, and, optionally,
// the observer height (in meters) relative to the horizon

SunCalc.getTimes = function (date, lat, lng, height) {

    height = height || 0;

    var lw = rad * -lng,
        phi = rad * lat,

        dh = observerAngle(height),

        d = toDays(date),
        n = julianCycle(d, lw),
        ds = approxTransit(0, lw, n),

        M = solarMeanAnomaly(ds),
        L = eclipticLongitude(M),
        dec = declination(L, 0),

        Jnoon = solarTransitJ(ds, M, L),

        i, len, time, h0, Jset, Jrise;


    var result = {
        solarNoon: fromJulian(Jnoon),
        nadir: fromJulian(Jnoon - 0.5)
    };

    for (i = 0, len = times.length; i < len; i += 1) {
        time = times[i];
        h0 = (time[0] + dh) * rad;

        Jset = getSetJ(h0, lw, phi, dec, n, M, L);
        Jrise = Jnoon - (Jset - Jnoon);

        result[time[1]] = fromJulian(Jrise);
        result[time[2]] = fromJulian(Jset);
    }

    return result;
};


return SunCalc;
}());

function validCoordinates(value) {
  return value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude)
    && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180;
}

async function daylightLocation() {
  const fm = FileManager.local();
  const path = fm.joinPath(fm.documentsDirectory(), SETTINGS.locationFile);
  // Location permission is requested only during the user's foreground setup.
  // Rerunning in Scriptable updates the saved location when travelling.
  if (config.runsInApp) {
    Location.setAccuracyToThreeKilometers();
    const position = await Location.current();
    if (!validCoordinates(position)) throw new Error("Could not determine your location. Run Calendar Wallpaper in Scriptable again.");
    const saved = {latitude: position.latitude, longitude: position.longitude};
    fm.writeString(path, JSON.stringify(saved));
    return saved;
  }
  let saved;
  try { if (fm.fileExists(path)) saved = JSON.parse(fm.readString(path)); } catch (_) {}
  if (!validCoordinates(saved)) throw new Error("Open Calendar Wallpaper in Scriptable and run it once to enable local sunrise and sunset.");
  return saved;
}

function appearanceChoice(parameter, now, position) {
  if (parameter === "day") return "light";
  if (parameter === "night") return "dark";
  // Geometric solar altitude with the standard sunrise/sunset horizon correction.
  // This also handles midnight sun and polar night without invalid event times.
  const altitude = Solar.getPosition(now, position.latitude, position.longitude).altitude;
  return altitude >= -0.833 * Math.PI / 180 ? "light" : "dark";
}

function remainingEvents(events, now) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const tomorrow = new Date(start);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return events.filter(event => {
    if (!(event.startDate instanceof Date) || !(event.endDate instanceof Date)) return false;
    const me = (event.attendees || []).find(person => person.isCurrentUser);
    if (me && me.status === "declined") return false;
    return event.startDate < tomorrow && event.endDate > now;
  }).sort((a, b) => Number(a.isAllDay) - Number(b.isAllDay) || a.startDate - b.startDate);
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function clipped(value, limit) {
  const chars = Array.from(clean(value));
  return chars.length > limit ? chars.slice(0, limit - 1).join("") + "…" : chars.join("");
}

function clock(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function dateLabel(date) {
  const f = new DateFormatter();
  f.dateFormat = "EEE, d MMM";
  return f.string(date);
}

function accentFor(event, theme) {
  // Calendar identity gives consistent, restrained colors across refreshes.
  const key = String(event.calendar.identifier || event.calendar.title || "");
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return theme.accents[hash % theme.accents.length];
}

function renderWallpaper(events, now, THEME = LIGHT_THEME) {
  if (events.length > SETTINGS.maxEvents) {
    throw new Error(`Today has ${events.length} remaining events. This layout fits up to ${SETTINGS.maxEvents}; the wallpaper was not replaced.`);
  }
  const ctx = new DrawContext();
  ctx.size = new Size(SETTINGS.width, SETTINGS.height);
  ctx.respectScreenScale = false;
  ctx.opaque = true;
  const scale = SETTINGS.width / 390;
  function rect(x, y, width, height) { return new Rect(x * scale, y * scale, width * scale, height * scale); }
  function fill(x, y, width, height, color) {
    ctx.setFillColor(new Color(color));
    ctx.fillRect(rect(x, y, width, height));
  }
  function text(value, x, y, width, height, size, color = THEME.ink, weight = "regular") {
    const font = weight === "serif" ? new Font("Georgia", size * scale)
      : weight === "medium" ? Font.mediumSystemFont(size * scale) : Font.regularSystemFont(size * scale);
    ctx.setFont(font);
    ctx.setTextColor(new Color(color));
    ctx.setTextAlignedLeft();
    ctx.drawTextInRect(value, rect(x, y, width, height));
  }
  function dot(x, y, radius, color) {
    ctx.setFillColor(new Color(color));
    ctx.fillEllipse(rect(x - radius, y - radius, radius * 2, radius * 2));
  }
  function tracked(value, x, y, spacing, color = THEME.muted) {
    for (const ch of value) {
      text(ch, x, y, 12, 15, 8, color, "medium");
      x += spacing;
    }
  }
  // Soft ivory-to-sand field, rendered natively rather than loading an asset.
  const rgb = hex => [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  const topRGB = rgb(THEME.background), bottomRGB = rgb(THEME.bottom);
  for (let y = 0; y < 844; y++) {
    const t = Math.pow(y / 843, 1.8);
    const color = topRGB.map((v, i) => Math.round(v + (bottomRGB[i] - v) * t).toString(16).padStart(2, "0")).join("");
    fill(0, y, 390, 1, color);
  }
  // Faint architectural arcs frame the clock without competing with the agenda.
  ctx.setStrokeColor(new Color(THEME.arcs, 0.22));
  ctx.setLineWidth(0.6 * scale);
  for (let i = 0; i < 3; i++) ctx.strokeEllipse(rect(132 + i * 17, -245 - i * 9, 495, 540));

  const top = SETTINGS.agendaTop;
  text(events.length ? `${events.length} still ahead` : "A little room to breathe", 35, top + 4, 320, 20, 11, THEME.muted);
  fill(35, top + 32, 320, 0.5, THEME.border);
  const cardTop = top + 58;
  const available = SETTINGS.agendaBottom - cardTop;
  const rowHeight = events.length ? Math.min(88, available / events.length) : 88;
  // Follow the actual list, with a hard upper bound above the flashlight/camera.
  const footerTop = cardTop + rowHeight * Math.max(1, events.length);
  if (!events.length) {
    dot(40, cardTop + 12, 3, THEME.accents[1]);
    text("Nothing else scheduled.", 58, cardTop, 290, 32, 24, THEME.ink, "serif");
    text("The rest of today is yours.", 58, cardTop + 43, 290, 25, 12, THEME.muted);
  } else {
    const compact = events.length > 4;
    if (events.length > 1) fill(97, cardTop + 12, 0.5, rowHeight * (events.length - 1), THEME.border);
    events.forEach((event, index) => {
      const y = cardTop + index * rowHeight;
      const ongoing = !event.isAllDay && event.startDate <= now;
      const next = !event.isAllDay && !ongoing && index === 0;
      const accent = accentFor(event, THEME);
      if (ongoing) dot(97, y + 12, 8, THEME.halo);
      dot(97, y + 12, ongoing ? 3.5 : 2.5, accent);
      text(event.isAllDay ? "All day" : clock(event.startDate), 35, y + 4, 57, 23, compact ? 11 : 13, ongoing ? THEME.ink : THEME.muted, "medium");
      if (!compact && !event.isAllDay) text(clock(event.endDate), 35, y + 28, 57, 18, 10, THEME.muted);
      text(clipped(event.title || "Untitled event", compact ? 25 : 23), 117, y, 240, 30, compact ? 16 : 20, THEME.ink);
      if (!compact) {
        const detail = SETTINGS.showLocations && clean(event.location) ? event.location : event.calendar.title;
        text(clipped(detail, 33), 117, y + 30, 240, 18, 10, THEME.muted);
        const status = event.isAllDay ? "ALL DAY" : ongoing ? "NOW" : next ? "UP NEXT" : "";
        if (status) tracked(status, 117, y + 53, 7.2, accent);
      } else if (ongoing) {
        text("NOW", 35, y + 23, 55, 12, 8, accent);
      }
    });
  }
  dot(38, footerTop + 10, 1.8, THEME.accents[1]);
  text(`Updated ${dateLabel(now)} · ${clock(now)}`, 48, footerTop + 3, 307, 17, 9, THEME.muted);
  return ctx.getImage();
}

async function selectedCalendars(reset = false) {
  const fm = FileManager.local();
  const file = fm.joinPath(fm.documentsDirectory(), SETTINGS.calendarSelectionFile);
  if (reset || !fm.fileExists(file)) {
    if (!config.runsInApp) throw new Error("Open Calendar Wallpaper in Scriptable once to select calendars and grant Full Access before running the shortcut.");
    const selected = await Calendar.presentPicker(true);
    if (!selected.length) throw new Error("No calendars selected. Run again and select your Google calendars.");
    fm.writeString(file, JSON.stringify(selected.map(calendar => calendar.identifier)));
    return selected;
  }
  const ids = JSON.parse(fm.readString(file));
  if (!Array.isArray(ids) || !ids.length) throw new Error("Calendar selection is invalid. Run with the parameter setup to select calendars again.");
  const available = await Calendar.forEvents();
  const selected = ids.map(id => available.find(calendar => calendar.identifier === id));
  if (selected.some(calendar => !calendar)) throw new Error("A selected calendar is unavailable. Check Calendar access and Google sync, then run with the parameter setup to reselect calendars.");
  return selected;
}

async function main() {
  const parameter = typeof args.shortcutParameter === "string" ? args.shortcutParameter.trim().toLowerCase() : args.shortcutParameter;
  const position = await daylightLocation();
  const now = new Date();
  const mode = appearanceChoice(parameter, now, position);
  const calendars = await selectedCalendars(parameter === "setup");
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const events = await CalendarEvent.between(start, end, calendars);
  const image = renderWallpaper(remainingEvents(events, now), now, mode === "dark" ? DARK_THEME : LIGHT_THEME);
  // Scriptable explicitly supports returning an iCloud file to Shortcuts.
  // Keep PNG data out of the text/JSON bridge.
  const fm = FileManager.iCloud();
  const output = fm.joinPath(fm.documentsDirectory(), "calendar-wallpaper.png");
  fm.writeImage(output, image);
  if (config.runsInApp) await QuickLook.present(image);
  Script.setShortcutOutput(output);
  return output;
}

return await main();
