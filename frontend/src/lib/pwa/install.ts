// beforeinstallprompt capture (US2). Chromium-family browsers fire a cancelable
// `beforeinstallprompt` event when the PWA is installable; the spec requires we
// suppress the mini-infobar and drive installation from our own UI. We stash the
// event in a store so the install-first gate (`+page.svelte`) can render a native
// Install button and call `prompt()` on demand. iOS Safari never fires this event
// (A2HS is manual), so its absence is expected there — capability.ts handles iOS.

import { writable, get } from 'svelte/store';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// null until the browser tells us the app is installable (or after it is installed).
export const installPromptEvent = writable<BeforeInstallPromptEvent | null>(null);

// Attach the window listeners once, on first client load (called from +layout.svelte).
export function initInstallCapture(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // suppress the default mini-infobar; we drive the UI
    installPromptEvent.set(e as BeforeInstallPromptEvent);
  });
  // Once installed the stored event is spent and must not be reused.
  window.addEventListener('appinstalled', () => installPromptEvent.set(null));
}

// Trigger the captured native install prompt. Returns the user's choice, or
// 'unavailable' if no prompt was captured (iOS / already installed / unsupported).
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const ev = get(installPromptEvent);
  if (!ev) return 'unavailable';
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  installPromptEvent.set(null); // a beforeinstallprompt event can only be used once
  return outcome;
}
