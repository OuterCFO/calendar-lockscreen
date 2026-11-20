import {timingSafeEqual} from "node:crypto";
import {buildWallpaper, readConfig, ConfigError} from "../lib/wallpaper.js";

function sameSecret(given, expected) {
  const a = Buffer.from(String(given || "")), b = Buffer.from(String(expected || ""));
  return b.length >= 16 && a.length === b.length && timingSafeEqual(a, b);
}

function failure(status, message) {
  return new Response(message + "\n", {status, headers: {"content-type": "text/plain; charset=utf-8", "cache-control": "no-store"}});
}

export async function handle(request, env = process.env, deps = {}) {
  const url = new URL(request.url);
  if (!sameSecret(url.searchParams.get("key"), env.WALLPAPER_KEY)) return failure(401, "Wrong or missing key.");
  const mode = (url.searchParams.get("mode") || "auto").toLowerCase();
  if (!["auto", "day", "night"].includes(mode)) return failure(400, "mode must be auto, day or night.");
  let config;
  try {
    config = readConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return failure(500, "Server setup: " + error.message);
    throw error;
  }
  try {
    const {png, theme, count} = await buildWallpaper({config, mode, ...deps});
    return new Response(png, {headers: {
      "content-type": "image/png", "cache-control": "no-store",
      "x-wallpaper-theme": theme, "x-wallpaper-events": String(count),
    }});
  } catch (error) {
    console.error(error);
    return failure(502, "Could not build the wallpaper: " + error.message);
  }
}

export function GET(request) {
  return handle(request);
}
