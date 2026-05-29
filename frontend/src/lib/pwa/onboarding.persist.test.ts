// US3 / T023 — durable-storage request behavior (SC-006). On first launch the
// app asks for persistent storage exactly once and then proceeds regardless of
// the outcome (granted, denied, or unsupported). jsdom gives us localStorage;
// navigator.storage is mocked per case.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { requestPersistentStorage, loadOnboardingState } from './onboarding';

function mockStorage(persistImpl: (() => Promise<boolean>) | null) {
  if (persistImpl === null) {
    // Unsupported: no Storage Manager at all.
    Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true });
  } else {
    Object.defineProperty(navigator, 'storage', {
      value: { persist: vi.fn(persistImpl) },
      configurable: true,
    });
  }
}

describe('requestPersistentStorage (US3, SC-006)', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests persistence once on first launch and records a granted result', async () => {
    mockStorage(() => Promise.resolve(true));

    await requestPersistentStorage();

    const persist = (navigator.storage as unknown as { persist: ReturnType<typeof vi.fn> }).persist;
    expect(persist).toHaveBeenCalledTimes(1);
    const state = loadOnboardingState();
    expect(state.persistRequested).toBe(true);
    expect(state.persistGranted).toBe(true);
  });

  it('records a denied result and the app still proceeds', async () => {
    mockStorage(() => Promise.resolve(false));

    await expect(requestPersistentStorage()).resolves.toBeUndefined();

    const state = loadOnboardingState();
    expect(state.persistRequested).toBe(true);
    expect(state.persistGranted).toBe(false);
  });

  it('never asks twice — the guard holds across launches', async () => {
    mockStorage(() => Promise.resolve(true));

    await requestPersistentStorage();
    await requestPersistentStorage();

    const persist = (navigator.storage as unknown as { persist: ReturnType<typeof vi.fn> }).persist;
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('proceeds without throwing when the Storage Manager is unsupported', async () => {
    mockStorage(null);

    await expect(requestPersistentStorage()).resolves.toBeUndefined();

    const state = loadOnboardingState();
    expect(state.persistRequested).toBe(true);
    expect(state.persistGranted).toBeNull();
  });
});
