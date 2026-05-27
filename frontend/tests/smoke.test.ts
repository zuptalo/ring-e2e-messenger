import { describe, it, expect } from 'vitest';
import { VERSION, COMMIT } from '../src/lib/version';

describe('lib/version', () => {
  it('exposes a non-empty VERSION string with a sensible default', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION.length).toBeGreaterThan(0);
  });

  it('exposes a non-empty COMMIT string with a sensible default', () => {
    expect(typeof COMMIT).toBe('string');
    expect(COMMIT.length).toBeGreaterThan(0);
  });

  it('defaults are "dev" / "unknown" when env vars are not injected', () => {
    // import.meta.env.VITE_RING_VERSION is undefined under vitest unless
    // explicitly set; the lib MUST fall back to the documented defaults.
    if (import.meta.env.VITE_RING_VERSION === undefined) {
      expect(VERSION).toBe('dev');
    }
    if (import.meta.env.VITE_RING_COMMIT === undefined) {
      expect(COMMIT).toBe('unknown');
    }
  });
});
