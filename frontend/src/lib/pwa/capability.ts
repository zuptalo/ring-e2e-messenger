// Device Capability Profile (data-model.md §1): a derived, in-memory view of
// the current environment that drives which onboarding/gating UI renders and
// whether to request notification permission. Detection is UA-based because no
// reliable JS API exposes "is iOS Safari" or the iOS version (needed for the
// 16.4 web-push boundary). `detectCapability` is pure for testability;
// `getCapabilityProfile` reads the live environment.

export type Platform = 'ios' | 'android' | 'other';

export interface IOSVersion {
  major: number;
  minor: number;
}

export interface CapabilityProfile {
  platform: Platform;
  isIOSSafari: boolean;
  /** Chromium-family engine (Chrome/Edge/Brave/Opera/…). Drives the "already
   *  installed" heuristic: a Chromium browser that fires no beforeinstallprompt
   *  while not in standalone has almost certainly already installed the app
   *  (Chromium suppresses the event post-install), whereas Safari/Firefox never
   *  fire it. Not install eligibility — that is the captured event. */
  isChromium: boolean;
  iosVersion: IOSVersion | null;
  isStandalone: boolean;
  installPromptAvailable: boolean;
  pushCapable: boolean;
}

export interface CapabilityInput {
  userAgent: string;
  maxTouchPoints: number;
  standalone: boolean;
  installPromptAvailable?: boolean;
}

// All iOS browsers use WebKit; non-Safari UAs (CriOS, FxiOS, …) set isIOSSafari
// false. Coaching itself is gated on platform === 'ios' — any iOS browser can
// Add-to-Home-Screen and launch standalone, so all of them get the same steps.
const NON_SAFARI_IOS = /CriOS|FxiOS|EdgiOS|OPiOS|mercury/i;

export function detectCapability(input: CapabilityInput): CapabilityProfile {
  const ua = input.userAgent;

  const isAppleMobile = /iPad|iPhone|iPod/.test(ua);
  // iPadOS ≥13 in desktop mode reports a Macintosh UA but has a touch screen.
  const isIPadDesktop = ua.includes('Macintosh') && input.maxTouchPoints > 1;
  const isIOSDevice = isAppleMobile || isIPadDesktop;

  const platform: Platform = isIOSDevice ? 'ios' : /Android/.test(ua) ? 'android' : 'other';

  const isIOSSafari = isIOSDevice && !NON_SAFARI_IOS.test(ua);

  // Chromium-family engine. The "Chrome"/"Chromium" token also appears in
  // Edge/Brave/Opera/Samsung UAs; iOS Chrome (CriOS) does NOT carry it and is
  // gated out by platform === 'ios' anyway.
  const isChromium = !isIOSDevice && /Chrome|Chromium/.test(ua);

  let iosVersion: IOSVersion | null = null;
  if (isIOSDevice) {
    const m = ua.match(/OS (\d+)_(\d+)/); // "CPU iPhone OS 16_4 like Mac OS X"
    if (m) iosVersion = { major: Number(m[1]), minor: Number(m[2]) };
  }

  // Push-capable: non-iOS always; iOS only on ≥16.4. Unknown iOS version fails
  // safe (not capable) so we never promise push that may not arrive.
  let pushCapable: boolean;
  if (platform !== 'ios') {
    pushCapable = true;
  } else if (iosVersion === null) {
    pushCapable = false;
  } else {
    pushCapable = iosVersion.major > 16 || (iosVersion.major === 16 && iosVersion.minor >= 4);
  }

  return {
    platform,
    isIOSSafari,
    isChromium,
    iosVersion,
    isStandalone: input.standalone,
    installPromptAvailable: input.installPromptAvailable ?? false,
    pushCapable,
  };
}

// Reads the live browser environment. `installPromptAvailable` is supplied by
// the caller (it depends on whether a `beforeinstallprompt` event was captured).
// `standaloneOverride` lets a reactive caller drive recomputation when the
// display-mode flips (desktop install reparents the tab into an app window
// without a reload); when omitted the live media query is read.
export function getCapabilityProfile(
  installPromptAvailable = false,
  standaloneOverride?: boolean,
): CapabilityProfile {
  const standalone =
    standaloneOverride ??
    (window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true);

  return detectCapability({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone,
    installPromptAvailable,
  });
}
