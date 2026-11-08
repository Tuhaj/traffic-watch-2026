// Screenshot via Chrome DevTools Protocol (light/dark scheme, real wait for map tiles).
// Regenerate the OG image:  UDD=$(mktemp -d) node web/scripts/screenshot.mjs "https://traffic.isy.sh/?lang=pl" web/public/og.png 1200 630 light 10000
// Usage: node shot.mjs <url> <out.png> <width> <height> <scheme> <waitMs>
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const [url, out, w = "1200", h = "630", scheme = "light", wait = "9000"] = process.argv.slice(2);
const CH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn(CH, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${process.env.UDD}`, "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader", "--hide-scrollbars", `--window-size=${w},${h}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: 1, mobile: false });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
await send("Page.enable");
await send("Page.navigate", { url });
await sleep(+wait);
const { data } = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(data, "base64"));
ws.close(); chrome.kill();
console.log("saved", out);
process.exit(0);
