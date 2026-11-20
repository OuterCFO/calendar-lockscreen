import {createCanvas, GlobalFonts} from "@napi-rs/canvas";
import {fileURLToPath} from "node:url";
import {clockLabel, dateLabel} from "./time.js";

const fontDir = fileURLToPath(new URL("../fonts/", import.meta.url));
GlobalFonts.registerFromPath(fontDir + "Inter_400Regular.ttf", "Wallpaper Sans");
GlobalFonts.registerFromPath(fontDir + "Inter_500Medium.ttf", "Wallpaper Sans Medium");
GlobalFonts.registerFromPath(fontDir + "Gelasio_400Regular.ttf", "Wallpaper Serif");

// iPhone 14 / 13 / 12 lock screen. Layout is drawn in 390 x 844 logical points.
export const LAYOUT = {
  width: 1170,
  height: 2532,
  agendaTop: 306, // Leaves room for the native date and clock.
  agendaBottom: 680, // Keeps the list above the flashlight and camera buttons.
  maxRows: 8,
  showLocations: true,
};

export const LIGHT_THEME = {
  mode: "light",
  background: "e4d4bd", bottom: "d6c2a5", ink: "343b35",
  muted: "746e60", border: "c7b89f", accents: ["ae8068", "748570", "7d8e9e"],
  arcs: "b9aa90", halo: "cdd0b8",
};

export const DARK_THEME = {
  mode: "dark",
  background: "101512", bottom: "080b09", ink: "c8cabb",
  muted: "848b7f", border: "29322c", accents: ["b28c74", "92a387", "8c9ba6"],
  arcs: "61705b", halo: "293629",
};

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function accentFor(event, theme) {
  // Calendar identity gives consistent, restrained colors across refreshes.
  const key = String(event.calendar.identifier || event.calendar.title || "");
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return theme.accents[hash % theme.accents.length];
}

export function renderWallpaper(events, now, {theme = LIGHT_THEME, timeZone, layout = LAYOUT} = {}) {
  const scale = layout.width / 390;
  const canvas = createCanvas(layout.width, layout.height);
  const ctx = canvas.getContext("2d");
  const px = value => value * scale;
  const hex = (color, alpha = 1) => "#" + color + (alpha < 1 ? Math.round(alpha * 255).toString(16).padStart(2, "0") : "");

  const fill = (x, y, width, height, color) => {
    ctx.fillStyle = hex(color);
    ctx.fillRect(px(x), px(y), px(width), px(height));
  };
  const dot = (x, y, radius, color) => {
    ctx.fillStyle = hex(color);
    ctx.beginPath();
    ctx.arc(px(x), px(y), px(radius), 0, Math.PI * 2);
    ctx.fill();
  };
  const family = {regular: "Wallpaper Sans", medium: "Wallpaper Sans Medium", serif: "Wallpaper Serif"};
  // Draws one line, shortened with an ellipsis to fit maxWidth.
  const text = (value, x, y, maxWidth, size, color = theme.ink, weight = "regular", letterSpacing = 0) => {
    ctx.font = `${px(size)}px "${family[weight]}"`;
    ctx.letterSpacing = `${px(letterSpacing)}px`;
    ctx.fillStyle = hex(color);
    ctx.textBaseline = "top";
    let line = clean(value);
    if (ctx.measureText(line).width > px(maxWidth)) {
      const chars = Array.from(line);
      while (chars.length && ctx.measureText(chars.join("").trimEnd() + "…").width > px(maxWidth)) chars.pop();
      line = chars.join("").trimEnd() + "…";
    }
    ctx.fillText(line, px(x), px(y));
    ctx.letterSpacing = "0px";
  };

  // Soft vertical field, eased toward the bottom.
  const rgb = color => [0, 2, 4].map(offset => parseInt(color.slice(offset, offset + 2), 16));
  const top = rgb(theme.background), bottom = rgb(theme.bottom);
  for (let y = 0; y < 844; y++) {
    const t = Math.pow(y / 843, 1.8);
    fill(0, y, 390, 1.02, top.map((v, i) => Math.round(v + (bottom[i] - v) * t).toString(16).padStart(2, "0")).join(""));
  }
  // Faint arcs frame the clock without competing with the agenda.
  ctx.strokeStyle = hex(theme.arcs, 0.22);
  ctx.lineWidth = px(0.6);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(px(132 + i * 17 + 247.5), px(-245 - i * 9 + 270), px(247.5), px(270), 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  const overflow = events.length > layout.maxRows ? events.length - (layout.maxRows - 1) : 0;
  const visible = overflow ? events.slice(0, layout.maxRows - 1) : events;
  const rows = visible.length + (overflow ? 1 : 0);

  const agendaTop = layout.agendaTop;
  text(events.length ? `${events.length} still ahead` : "A little room to breathe", 35, agendaTop + 6, 320, 11, theme.muted);
  fill(35, agendaTop + 32, 320, 0.5, theme.border);
  const cardTop = agendaTop + 58;
  const rowHeight = rows ? Math.min(88, (layout.agendaBottom - cardTop) / rows) : 88;
  const footerTop = cardTop + rowHeight * Math.max(1, rows);

  if (!events.length) {
    dot(40, cardTop + 12, 3, theme.accents[1]);
    text("Nothing else scheduled.", 58, cardTop, 290, 24, theme.ink, "serif");
    text("The rest of today is yours.", 58, cardTop + 43, 290, 12, theme.muted);
  } else {
    const compact = rows > 4;
    if (rows > 1) fill(97, cardTop + 12, 0.5, rowHeight * (rows - 1), theme.border);
    visible.forEach((event, index) => {
      const y = cardTop + index * rowHeight;
      const ongoing = !event.isAllDay && event.startDate <= now;
      const next = !event.isAllDay && !ongoing && index === 0;
      const accent = accentFor(event, theme);
      if (ongoing) dot(97, y + 12, 8, theme.halo);
      dot(97, y + 12, ongoing ? 3.5 : 2.5, accent);
      text(event.isAllDay ? "All day" : clockLabel(event.startDate, timeZone), 35, y + 5, 57,
        compact ? 11 : 13, ongoing ? theme.ink : theme.muted, "medium");
      if (!compact && !event.isAllDay) text(clockLabel(event.endDate, timeZone), 35, y + 29, 57, 10, theme.muted);
      text(event.title || "Untitled event", 117, y + 2, 240, compact ? 16 : 20, theme.ink);
      if (!compact) {
        const detail = layout.showLocations && clean(event.location) ? event.location : event.calendar.title;
        text(detail, 117, y + 31, 240, 10, theme.muted);
        const status = event.isAllDay ? "ALL DAY" : ongoing ? "NOW" : next ? "UP NEXT" : "";
        if (status) text(status, 117, y + 54, 240, 8, accent, "medium", 2.2);
      } else if (ongoing) {
        text("NOW", 35, y + 24, 55, 8, accent, "medium", 1);
      }
    });
    if (overflow) {
      const y = cardTop + visible.length * rowHeight;
      dot(97, y + 12, 2.5, theme.border);
      text(`+ ${overflow} more today`, 117, y + 3, 240, 14, theme.muted);
    }
  }
  dot(38, footerTop + 10, 1.8, theme.accents[1]);
  text(`Updated ${dateLabel(now, timeZone)} · ${clockLabel(now, timeZone)}`, 48, footerTop + 4, 307, 9, theme.muted);
  return canvas.encode("png");
}
