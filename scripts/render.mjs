import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { startServer } from "./serve.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/local/bin/google-chrome",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("Chrome was not found. Set CHROME_PATH to a Chrome or Chromium binary.");
}

function icoFromPng(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, png]);
}

const server = await startServer(4173);
const browser = await puppeteer.launch({
  executablePath: chromePath(),
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await page.goto(`${server.url}/og-card.html`, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(dist, "og.png"),
    clip: { x: 0, y: 0, width: 1200, height: 630 },
  });

  const svg = fs.readFileSync(path.join(dist, "favicon.svg"), "utf8");
  async function raster(size, file) {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(
      `<!DOCTYPE html><html><head><style>html,body{margin:0;background:#0B0C0E}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svg}</body></html>`,
      { waitUntil: "load" },
    );
    const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: size, height: size } });
    fs.writeFileSync(path.join(dist, file), png);
    return png;
  }

  const png32 = await raster(32, "favicon.png");
  await raster(180, "apple-touch-icon.png");
  fs.writeFileSync(path.join(dist, "favicon.ico"), icoFromPng(png32, 32));

  await page.setViewport({ width: 816, height: 1056, deviceScaleFactor: 1 });
  await page.goto(`${server.url}/resume.html`, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMediaType("print");
  await page.pdf({
    path: path.join(dist, "resume.pdf"),
    format: "Letter",
    printBackground: true,
    preferCSSPageSize: false,
    displayHeaderFooter: false,
    margin: { top: "0.6in", bottom: "0.6in", left: "0.65in", right: "0.65in" },
  });

  fs.rmSync(path.join(dist, "og-card.html"), { force: true });
  console.log("Wrote og.png, favicon.png, apple-touch-icon.png, favicon.ico, resume.pdf");
} finally {
  await browser.close();
  await server.close();
}
