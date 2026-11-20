// Renders sample previews from tests/fixtures/sample.ics into assets/.
import {readFileSync, writeFileSync} from "node:fs";
import {buildWallpaper, readConfig} from "../lib/wallpaper.js";
import {zonedToInstant} from "../lib/time.js";

const ics = readFileSync(new URL("../tests/fixtures/sample.ics", import.meta.url), "utf8");
const config = readConfig({
  ICS_URLS: "https://calendar.example/sample.ics", TIME_ZONE: "Europe/Paris",
  LATITUDE: "48.8566", LONGITUDE: "2.3522", SELF_EMAILS: "me@example.com",
});
const now = zonedToInstant({year: 2026, month: 11, day: 20, hour: 9, minute: 41}, config.timeZone);
const fetchImpl = async () => new Response(ics);
for (const [mode, file] of [["day", "day.png"], ["night", "night.png"]]) {
  const {png} = await buildWallpaper({config, now, mode, fetchImpl});
  writeFileSync(new URL(`../assets/${file}`, import.meta.url), png);
  console.log(`assets/${file}`);
}
