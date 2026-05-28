import {
  defineConfig,
  minimal2023Preset,
  defaultAssetName,
} from '@vite-pwa/assets-generator/config';
import type { AssetType, ResolvedAssetSize } from '@vite-pwa/assets-generator/config';

// Single source of truth: every install icon, the maskable icon, the Apple
// touch icon, and the iOS launch/splash image set are generated from
// static/icons/icon.svg at build time by the pwaAssets integration (see
// vite.config.ts), output at the web root so the manifest's root-relative icon
// paths resolve. FR-001 / FR-017 / SC-009.
//
// All raster icons use cover + the brand navy (no white padding). iOS share-sheet
// previews often pick manifest / og:image icons — not only apple-touch-icon.
const BRAND_BG = '#0f1c2e';
const fullBleed = {
  padding: 0,
  resizeOptions: { fit: 'cover' as const, background: BRAND_BG },
};

function assetName(type: AssetType, size: ResolvedAssetSize): string {
  if (type === 'apple' && size.width === 180 && size.height === 180) {
    return 'apple-touch-icon.png';
  }
  if (type === 'apple' && size.width === 256 && size.height === 256) {
    return 'ring-share-256.png';
  }
  return defaultAssetName(type, size);
}

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  assetName,
  preset: {
    ...minimal2023Preset,
    transparent: {
      ...minimal2023Preset.transparent,
      ...fullBleed,
      favicons: [
        [48, 'favicon.ico'],
        [180, 'favicon.png'],
      ],
    },
    maskable: {
      ...minimal2023Preset.maskable,
      ...fullBleed,
    },
    apple: {
      sizes: [180, 256],
      ...fullBleed,
    },
    appleSplashScreens: {
      padding: 0.3,
      resizeOptions: { fit: 'cover' as const, background: BRAND_BG },
      sizes: [
        { width: 320, height: 568, scaleFactor: 2 },
        { width: 375, height: 667, scaleFactor: 2 },
        { width: 414, height: 736, scaleFactor: 3 },
        { width: 375, height: 812, scaleFactor: 3 },
        { width: 414, height: 896, scaleFactor: 2 },
        { width: 414, height: 896, scaleFactor: 3 },
        { width: 390, height: 844, scaleFactor: 3 },
        { width: 393, height: 852, scaleFactor: 3 },
        { width: 428, height: 926, scaleFactor: 3 },
        { width: 430, height: 932, scaleFactor: 3 },
        { width: 768, height: 1024, scaleFactor: 2 },
        { width: 834, height: 1194, scaleFactor: 2 },
        { width: 1024, height: 1366, scaleFactor: 2 },
      ],
      linkMediaOptions: { log: false, addMediaScreen: true, basePath: '/', xhtml: false },
      png: { compressionLevel: 9, quality: 60 },
      name: (landscape, size) =>
        `apple-splash-${landscape ? 'landscape' : 'portrait'}-${size.width}x${size.height}.png`,
    },
  },
  images: ['static/icons/icon.svg'],
});
