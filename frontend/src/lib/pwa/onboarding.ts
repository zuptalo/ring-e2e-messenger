// Onboarding State (data-model.md §2): durable per-browser-profile record so
// the app does not re-prompt for already-decided things and can track one-time
// first-launch actions. Persisted in localStorage under a single versioned key.
// The persist() and notification-permission orchestration that *consume* this
// state are wired in US3 / US2 respectively.

const KEY = 'ring.onboarding.v1';
const SCHEMA_VERSION = 1;

export type NotifPermission = 'default' | 'granted' | 'denied' | 'skipped';

export interface OnboardingState {
  schemaVersion: number;
  firstLaunchAt: string;
  persistRequested: boolean;
  persistGranted: boolean | null;
  notificationPermission: NotifPermission;
}

function defaults(): OnboardingState {
  return {
    schemaVersion: SCHEMA_VERSION,
    firstLaunchAt: new Date().toISOString(),
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
