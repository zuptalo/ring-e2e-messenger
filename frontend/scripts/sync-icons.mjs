#!/usr/bin/env node
// Generator writes next to static/icons/icon.svg. Copy to static/ web root with
// conventional filenames for iOS / Firefox / share-sheet metadata.
import { copyFileSync, existsSync, readdirSync } from 'node:fs';

const gen = 'static/icons';

if (!existsSync(gen)) {
  console.error('sync-icons: missing static/icons/ — run pwa-assets-generator first');
  process.exit(1);
}

const aliases = [
  ['apple-touch-icon-180x180.png', 'apple-touch-icon.png'],
  ['apple-touch-icon-180x180.png', 'apple-touch-icon-precomposed.png'],
  ['apple-touch-icon-256x256.png', 'ring-share-256.png'],
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

let count = 0;
for (const name of readdirSync(gen)) {
  if (!/\.(png|ico)$/i.test(name)) continue;
  const dest = `static/${name}`;
  if (existsSync(dest)) continue; // keep alias targets above
  copyFileSync(`${gen}/${name}`, dest);
  count++;
}

console.log(`sync-icons: copied ${count} additional assets to static/`);
