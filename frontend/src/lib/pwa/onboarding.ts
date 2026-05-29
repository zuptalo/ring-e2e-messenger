// Onboarding State (data-model.md §2): durable per-browser-profile record so
// the app does not re-prompt for already-decided things and can track one-time
// first-launch actions. Persisted in localStorage under a single versioned key.
// The persist() and notification-permission orchestration that *consume* this
// state are wired in US3 / US2 respectively.

import { logEvent } from './log';

const KEY = 'ring.onboarding.v1';
const SCHEMA_VERSION = 1;

export type NotifPermission = 'default' | 'granted' | 'denied' | 'skipped';

export interface OnboardingState {
  schemaVersion: number;
  firstLaunchAt: string;
  standaloneOnboarded: boolean;
  persistRequested: boolean;
  persistGranted: boolean | null;
  notificationPermission: NotifPermission;
}

function defaults(): OnboardingState {
  return {
    schemaVersion: SCHEMA_VERSION,
    firstLaunchAt: new Date().toISOString(),
    standaloneOnboarded: false,
    persistRequested: false,
    persistGranted: null,
    notificationPermission: 'default',
  };
}

export function loadOnboardingState(): OnboardingState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const fresh = defaults();
      saveOnboardingState(fresh); // stamp firstLaunchAt once
      return fresh;
    }
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    // Unknown/newer schema → reset (onboarding re-runs are cheap; forward-compatible per Principle IV).
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      const fresh = defaults();
      saveOnboardingState(fresh);
      return fresh;
    }
    return { ...defaults(), ...parsed, schemaVersion: SCHEMA_VERSION };
  } catch {
    // localStorage unavailable (private mode, disabled) — best-effort in-memory defaults.
    return defaults();
  }
}

export function saveOnboardingState(state: OnboardingState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // best-effort; durability is not guaranteed (see navigator.storage.persist)
  }
}

export function updateOnboardingState(patch: Partial<OnboardingState>): OnboardingState {
  const next: OnboardingState = {
    ...loadOnboardingState(),
    ...patch,
    schemaVersion: SCHEMA_VERSION,
  };
  saveOnboardingState(next);
  return next;
}

// Onboarding-final step, part 1 (T021, contracts/onboarding-ui.md §"Onboarding-
// final step"): runs once on the first standalone launch. Logs install.completed
// and, on a push-incapable platform (iOS <16.4 or no Notification API), records
// 'skipped' — there is nothing to prompt for. On a push-capable platform it does
// NOT request permission here: the request MUST originate from a user gesture
// (iOS Safari standalone requires one; Chrome otherwise shows only a silent
// quiet-UI chip). The gesture path is requestNotificationPermission below.
// MUST NOT be invoked in any pre-install view — only from the standalone app
// shell (FR-006, SC-004). Idempotent via the standaloneOnboarded guard.
export function enterStandalone(pushCapable: boolean): void {
  const state = loadOnboardingState();
  if (state.standaloneOnboarded) return; // first standalone launch only

  updateOnboardingState({ standaloneOnboarded: true });
  logEvent('install.completed', 'standalone');

  if (
    (!pushCapable || typeof Notification === 'undefined') &&
    state.notificationPermission === 'default'
  ) {
    updateOnboardingState({ notificationPermission: 'skipped' });
    logEvent('notif.permission', 'skipped');
  }
}

// Onboarding-final step, part 2: invoked from a user gesture (the "Enable
// notifications" tap in the standalone shell). Requests the OS permission and
// persists the outcome. A dismissed prompt stays 'default' so a later gesture
// may ask again; only granted/denied/skipped stick.
export async function requestNotificationPermission(): Promise<NotifPermission> {
  if (typeof Notification === 'undefined') {
    updateOnboardingState({ notificationPermission: 'skipped' });
    logEvent('notif.permission', 'skipped');
    return 'skipped';
  }
  try {
    const result = await Notification.requestPermission();
    if (result === 'granted' || result === 'denied') {
      updateOnboardingState({ notificationPermission: result });
      logEvent('notif.permission', result);
      return result;
    }
    logEvent('notif.permission', 'default');
    return 'default';
  } catch {
    updateOnboardingState({ notificationPermission: 'skipped' });
    logEvent('notif.permission', 'skipped');
    return 'skipped';
  }
}

// "Not now" — the user declined the notification step; do not prompt again.
export function skipNotificationPermission(): NotifPermission {
  updateOnboardingState({ notificationPermission: 'skipped' });
  logEvent('notif.permission', 'skipped');
  return 'skipped';
}

// First-launch durable-storage request (T026, US3, SC-006). Asks the browser to
// make storage persistent so the device doesn't evict the local message DB under
// pressure. Attempted exactly once (guarded by persistRequested); the app
// proceeds regardless of the outcome — persistence is best-effort. Feature-
// detected: an absent Storage Manager records an 'unsupported' outcome.
export async function requestPersistentStorage(): Promise<void> {
  const state = loadOnboardingState();
  if (state.persistRequested) return; // ask once only — never re-prompt

  const sm = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!sm || typeof sm.persist !== 'function') {
    updateOnboardingState({ persistRequested: true, persistGranted: null });
    logEvent('storage.persist', 'unsupported');
    return;
  }

  try {
    const granted = await sm.persist();
    updateOnboardingState({ persistRequested: true, persistGranted: granted });
    logEvent('storage.persist', granted ? 'granted' : 'denied');
  } catch {
    updateOnboardingState({ persistRequested: true, persistGranted: null });
    logEvent('storage.persist', 'unsupported');
  }
}
