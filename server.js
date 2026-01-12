import express from "express";
import puppeteer from "puppeteer-core";

const app = express();

const TARGET_URL = process.env.TARGET_URL;
if (!TARGET_URL) throw new Error("TARGET_URL is required");

const FPS = Number(process.env.FPS ?? "1");
const WIDTH = Number(process.env.WIDTH ?? "1280");
const HEIGHT = Number(process.env.HEIGHT ?? "720");
const QUALITY = Number(process.env.QUALITY ?? "70");
const DEVICE_SCALE_FACTOR = Number(process.env.DEVICE_SCALE_FACTOR ?? "1");
const WAIT_UNTIL = process.env.WAIT_UNTIL ?? "networkidle2";
const SETTLE_MS = Number(process.env.SETTLE_MS ?? "2000");
const RELOAD_EVERY_SEC = Number(process.env.RELOAD_EVERY_SEC ?? "1800");

const BROWSER_WS = process.env.BROWSER_WS; // e.g. ws://browser:3000?token=secret

let browser, page;

async function init() {
  browser = await puppeteer.connect({ browserWSEndpoint: BROWSER_WS });
  page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: DEVICE_SCALE_FACTOR });

  await page.goto(TARGET_URL, { waitUntil: WAIT_UNTIL, timeout: 120000 });
  await new Promise(r => setTimeout(r, SETTLE_MS));

  if (RELOAD_EVERY_SEC > 0) {
    setInterval(async () => {
      try {
        await page.reload({ waitUntil: WAIT_UNTIL, timeout: 120000 });
        await new Promise(r => setTimeout(r, SETTLE_MS));
      } catch { /* ignore */ }
    }, RELOAD_EVERY_SEC * 1000);
  }
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/stream.mjpg", async (req, res) => {
  if (!page) return res.status(503).send("not ready");

  const boundary = "frame";
  res.writeHead(200, {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Connection": "keep-alive",
    "Content-Type": `multipart/x-mixed-replace; boundary=${boundary}`,
  });

  let running = true;
  req.on("close", () => { running = false; });

  const intervalMs = FPS > 0 ? Math.max(1, Math.floor(1000 / FPS)) : 1000;

  while (running) {
    try {
      const jpeg = await page.screenshot({ type: "jpeg", quality: QUALITY });

      res.write(`--${boundary}\r\n`);
      res.write("Content-Type: image/jpeg\r\n");
      res.write(`Content-Length: ${jpeg.length}\r\n\r\n`);
      res.write(jpeg);
      res.write("\r\n");
    } catch { /* keep going */ }

    await new Promise(r => setTimeout(r, intervalMs));
  }
});

(async () => {
  await init();
  const port = Number(process.env.PORT ?? "8080");
  app.listen(port, () => console.log(`mjpeg on :${port}`));
})();
