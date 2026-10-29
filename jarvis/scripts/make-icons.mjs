// Genera los íconos PNG de la app a partir de public/icons/jarvis.svg.
// Uso: npm run icons   (requiere Playwright con Chromium instalado)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.resolve(import.meta.dirname, "..");
const svg = fs.readFileSync(path.join(root, "public/icons/jarvis.svg"), "utf8");

const targets = [
  { file: "public/icons/icon-192.png", size: 192, pad: 0 },
  { file: "public/icons/icon-512.png", size: 512, pad: 0 },
  { file: "public/icons/maskable-512.png", size: 512, pad: 0.12 },
  { file: "public/apple-touch-icon.png", size: 180, pad: 0 },
  { file: "src/app/icon.png", size: 48, pad: 0 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  const inner = Math.round(t.size * (1 - t.pad * 2));
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:#05080f;display:grid;place-items:center;width:${t.size}px;height:${t.size}px">
     <div style="width:${inner}px;height:${inner}px">${svg.replace("<svg ", `<svg width="${inner}" height="${inner}" `)}</div></body></html>`,
  );
  await page.screenshot({ path: path.join(root, t.file), type: "png", omitBackground: false });
  console.log("✓", t.file);
}
// Insignia monocromática (la usa Android; iOS usa el ícono de la app).
await page.setViewportSize({ width: 96, height: 96 });
await page.setContent(
  `<html><body style="margin:0;background:transparent"><svg width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="34" fill="none" stroke="#fff" stroke-width="8"/><text x="48" y="62" text-anchor="middle" font-family="Arial" font-weight="700" font-size="40" fill="#fff">J</text></svg></body></html>`,
);
await page.screenshot({ path: path.join(root, "public/icons/badge-96.png"), omitBackground: true });
console.log("✓ public/icons/badge-96.png");
await browser.close();
