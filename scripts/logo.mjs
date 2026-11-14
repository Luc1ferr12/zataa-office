#!/usr/bin/env node
// Render logo brand dari templates/logo/logo.html → PNG 512×512 transparan (0 token).
//   node scripts/logo.mjs   → docs/assets/about-esports-logo.png (feed/video Marketing) + docs/assets/logo.png (Zaa Office, web)
import { chromium } from 'playwright-core';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = { esports: 'docs/assets/about-esports-logo.png', zaa: 'docs/assets/logo.png' };

let browser;
for (const o of [{ channel: 'chrome' }, { channel: 'msedge' }, { executablePath: process.env.CHROME_PATH }]) {
  if (o.executablePath === undefined && !o.channel) continue;
  try { browser = await chromium.launch(o); break; } catch { /* coba berikutnya */ }
}
if (!browser) throw new Error('Chrome/Edge nggak ketemu (set CHROME_PATH)');
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
for (const [k, out] of Object.entries(OUT)) {
  await page.goto(`${pathToFileURL(join(ROOT, 'templates/logo/logo.html')).href}?k=${k}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(ROOT, out), omitBackground: true });
  console.log(out);
}
await browser.close();
