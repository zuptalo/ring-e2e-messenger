import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Single source of truth: every install icon, the maskable icon, and the Apple
// touch icon are generated from static/icon.svg at build time by the pwaAssets
// integration (see vite.config.ts), output at the web root so the manifest's
// root-relative icon paths resolve. FR-001 / FR-017 / SC-009.
// (The appleSplashScreens block below is wired up for the iOS launch images,
// completed alongside the iOS work in US3.)
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // iOS home-screen launch images. A representative set of current
    // iPhone/iPad logical sizes; the generator emits portrait + landscape
    // PNGs plus the media-query <link> tags injected into the document head.
    appleSplashScreens: {
      sizes: [
        [320, 568], // iPhone SE (1st)
        [375, 667], // iPhone 8 / SE 2-3
        [390, 844], // iPhone 12/13/14
        [393, 852], // iPhone 15/16
        [414, 896], // iPhone XR/11
        [428, 926], // iPhone 14 Plus
        [430, 932], // iPhone 15/16 Pro Max
        [768, 1024], // iPad mini/Air
        [834, 1194], // iPad Pro 11"
        [1024, 1366], // iPad Pro 12.9"
      ],
      linkMediaOptions: { log: false, addMediaScreen: true, basePath: '/', xhtml: false },
      png: { lossless: false },
    },
  },
  images: ['static/icon.svg'],
});
