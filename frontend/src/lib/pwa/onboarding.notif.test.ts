// US2 / T021 — onboarding-final notification step. The permission request must
// come from a user gesture (the "Enable notifications" tap), not an auto on-load
// call (iOS Safari standalone rejects a gesture-less request; Chrome downgrades
// it to a silent chip). These cover the durable bookkeeping around that gesture.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  enterStandalone,
  requestNotificationPermission,
  skipNotificationPermission,
  loadOnboardingState,
} from './onboarding';

function mockNotification(
  result: NotificationPermission | (() => Promise<NotificationPermission>),
) {
  const requestPermission = vi.fn(
    typeof result === 'function' ? result : () => Promise.resolve(result),
  );
  // Only requestPermission is consulted by the onboarding code.
  Object.defineProperty(globalThis, 'Notification', {
    value: { requestPermission },
    configurable: true,
  });
  return requestPermission;
}

describe('onboarding-final notification step (US2, FR-006)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error — remove the mocked global between cases
    delete globalThis.Notification;
  });

  it('enterStandalone logs once and does NOT auto-request on a push-capable platform', () => {
    const requestPermission = mockNotification('granted');

    enterStandalone(true);
    enterStandalone(true); // second launch is a no-op (guard)

    expect(requestPermission).not.toHaveBeenCalled();
    const state = loadOnboardingState();
    expect(state.standaloneOnboarded).toBe(true);
    // Still pending a user gesture.
    expect(state.notificationPermission).toBe('default');
  });

  it('enterStandalone records "skipped" on a push-incapable platform (no prompt)', () => {
    enterStandalone(false);
    expect(loadOnboardingState().notificationPermission).toBe('skipped');
  });

  it('requestNotificationPermission persists a granted result', async () => {
    mockNotification('granted');
    await expect(requestNotificationPermission()).resolves.toBe('granted');
    expect(loadOnboardingState().notificationPermission).toBe('granted');
  });

  it('a dismissed prompt stays default so a later gesture can ask again', async () => {
    mockNotification('default');
    await expect(requestNotificationPermission()).resolves.toBe('default');
    expect(loadOnboardingState().notificationPermission).toBe('default');
  });

  it('skipNotificationPermission records "skipped"', () => {
    expect(skipNotificationPermission()).toBe('skipped');
    expect(loadOnboardingState().notificationPermission).toBe('skipped');
  });
});
