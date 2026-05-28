import { describe, it, expect } from 'vitest';
import { detectCapability } from './capability';

const UA = {
  iosSafari164:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1',
  iosSafari163:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1',
  iosSafari156:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 15_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1',
  iosSafari171:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  iosChrome164:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/110.0.0.0 Mobile/15E148 Safari/604.1',
  ipadDesktopMode:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36',
  desktopChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
};

describe('detectCapability', () => {
  it('iOS Safari 16.4 → iOS, Safari, version 16.4, push-capable', () => {
    const p = detectCapability({
      userAgent: UA.iosSafari164,
      maxTouchPoints: 5,
      standalone: false,
    });
    expect(p.platform).toBe('ios');
    expect(p.isIOSSafari).toBe(true);
    expect(p.iosVersion).toEqual({ major: 16, minor: 4 });
    expect(p.pushCapable).toBe(true);
  });

  it('iOS Safari 16.3 → NOT push-capable (below the 16.4 boundary)', () => {
    const p = detectCapability({
      userAgent: UA.iosSafari163,
      maxTouchPoints: 5,
      standalone: false,
    });
    expect(p.iosVersion).toEqual({ major: 16, minor: 3 });
    expect(p.pushCapable).toBe(false);
  });

  it('iOS Safari 15.6 → NOT push-capable', () => {
    const p = detectCapability({
      userAgent: UA.iosSafari156,
      maxTouchPoints: 5,
      standalone: false,
    });
    expect(p.pushCapable).toBe(false);
  });

  it('iOS Safari 17.1 → push-capable', () => {
    const p = detectCapability({
      userAgent: UA.iosSafari171,
      maxTouchPoints: 5,
      standalone: false,
    });
    expect(p.iosVersion).toEqual({ major: 17, minor: 1 });
    expect(p.pushCapable).toBe(true);
  });

  it('iOS Chrome (CriOS) → iOS but NOT Safari', () => {
    const p = detectCapability({
      userAgent: UA.iosChrome164,
      maxTouchPoints: 5,
      standalone: false,
    });
    expect(p.platform).toBe('ios');
    expect(p.isIOSSafari).toBe(false);
  });

  it('iPadOS desktop-mode (Macintosh + touch) → iOS Safari, version unparseable → NOT push-capable (fail-safe)', () => {
    const p = detectCapability({
      userAgent: UA.ipadDesktopMode,
      maxTouchPoints: 5,
      standalone: false,
    });
    expect(p.platform).toBe('ios');
    expect(p.isIOSSafari).toBe(true);
    expect(p.iosVersion).toBeNull();
    expect(p.pushCapable).toBe(false);
  });

  it('Android Chrome → android, not iOS Safari, push-capable', () => {
    const p = detectCapability({
      userAgent: UA.androidChrome,
      maxTouchPoints: 5,
      standalone: false,
    });
    expect(p.platform).toBe('android');
    expect(p.isIOSSafari).toBe(false);
    expect(p.pushCapable).toBe(true);
  });

  it('Desktop Chrome (no touch) → other, not iOS, push-capable', () => {
    const p = detectCapability({
      userAgent: UA.desktopChrome,
      maxTouchPoints: 0,
      standalone: false,
    });
    expect(p.platform).toBe('other');
    expect(p.isIOSSafari).toBe(false);
    expect(p.pushCapable).toBe(true);
  });

  it('standalone + installPromptAvailable flow through', () => {
    const p = detectCapability({
      userAgent: UA.androidChrome,
      maxTouchPoints: 5,
      standalone: true,
      installPromptAvailable: true,
    });
    expect(p.isStandalone).toBe(true);
    expect(p.installPromptAvailable).toBe(true);
  });
});
