/**
 * Capture the README screenshots from `dev/demo.html`.
 *
 *   npm run screenshots              every scene
 *   npm run screenshots sideways     just one
 *
 * Scripted rather than taken by hand because a screenshot is a build artifact
 * like any other: the card changes, and the picture in the README quietly stops
 * being true. This regenerates all of them in a few seconds, at a fixed size and
 * a fixed pixel ratio, with no cropping step to clip the tile attribution.
 *
 * It starts the dev server itself, so there is nothing to have running first.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'images');

/** Wide enough to read the info rows, near the width of a dashboard column. */
const WIDTH = 460;

/**
 * Retina. A 1x screenshot of a map looks soft on every modern display, and
 * GitHub renders the README at whatever width it likes, so the extra pixels are
 * the difference between crisp and smeared.
 */
const SCALE = 2;

/** Every tile drawn, or the basemap photographs half grey. */
async function tilesLoaded(page) {
  await page.waitForFunction(
    () => {
      const card = document.querySelector('airflow-map-card');
      const tiles = card?.shadowRoot?.querySelectorAll('img.leaflet-tile');
      if (!tiles || tiles.length === 0) return false;
      return [...tiles].every((img) => img.complete && img.naturalWidth > 0);
    },
    undefined,
    { timeout: 20000 },
  );
}

async function main() {
  const only = process.argv[2];

  const server = await createServer({ configFile: join(ROOT, 'vite.config.ts') });
  await server.listen();
  const base = server.resolvedUrls.local[0].replace(/\/$/, '');

  const browser = await chromium.launch();
  const context = await browser.newContext({
    deviceScaleFactor: SCALE,
    viewport: { width: WIDTH + 80, height: 900 },
    // The flow is half the point of the card. Left to the machine's setting,
    // a developer with reduced motion enabled would capture a still frame and
    // not notice.
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();

  await page.goto(`${base}/demo.html`);
  const scenes = await page.evaluate(() => window.scenes ?? []);
  const wanted = only ? scenes.filter((id) => id === only) : scenes;

  if (wanted.length === 0) {
    throw new Error(`No scene called "${only}". Try one of: ${scenes.join(', ')}`);
  }

  mkdirSync(OUT, { recursive: true });

  for (const id of wanted) {
    await page.goto(`${base}/demo.html?solo=${id}&width=${WIDTH}`);
    await tilesLoaded(page);
    // Let the particles lay down trails. Freshly seeded they are dots, which
    // photographs as noise over the map rather than as wind.
    await page.waitForTimeout(1500);

    const file = join(OUT, `${id}.png`);
    await page.locator('.card-frame').screenshot({ path: file });
    console.info(`  ${id.padEnd(14)} -> images/${id}.png`);
  }

  await browser.close();
  await server.close();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
