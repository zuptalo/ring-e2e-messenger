#!/usr/bin/env node
// The committed icon set lives in static/icons/ (generated from icon.svg by
// pwa-assets-generator). Everything that references icons points at /icons/…,
// EXCEPT a few names that must sit at the web root because clients fetch them by
// convention without reading the HTML: Safari/crawlers probe /apple-touch-icon.png,
// browsers probe /favicon.png, and the share image is advertised at /ring-share-256.png
// (manifest icons[0] + og:image). This mirrors just those three from static/icons/
// to the web root; all three are committed, so a clean build needs no generation step.
import { copyFileSync, existsSync } from 'node:fs';

const gen = 'static/icons';

if (!existsSync(gen)) {
  console.error('sync-icons: missing static/icons/ — run pwa-assets-generator first');
  process.exit(1);
}

const aliases = [
  ['apple-touch-icon-180x180.png', 'apple-touch-icon.png'],
  ['apple-touch-icon-256x256.png', 'ring-share-256.png'],
  ['favicon.png', 'favicon.png'],
];

for (const [srcName, destName] of aliases) {
  const src = `${gen}/${srcName}`;
  if (!existsSync(src)) {
    console.error(`sync-icons: missing ${src}`);
    process.exit(1);
  }
  copyFileSync(src, `static/${destName}`);
  console.log(`sync-icons: static/${destName}`);
}
