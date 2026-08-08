import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  sourceCode: { scriptURL: 'http://192.168.0.13:8081/index.bundle?platform=ios' },
}));

vi.mock('expo-constants', () => ({
  default: { expoConfig: {} },
}));

vi.mock('react-native', () => ({
  NativeModules: { SourceCode: { getConstants: () => native.sourceCode } },
  Platform: { OS: 'ios' },
}));

// Mocks must be registered before this native-facing module is evaluated.
// eslint-disable-next-line import/first
import { apiBaseUrl, hostFromUri } from '../client';

describe('development API host', () => {
  beforeEach(() => {
    native.sourceCode.scriptURL = 'http://192.168.0.13:8081/index.bundle?platform=ios';
  });

  it('uses the LAN host of the bundle loaded by a physical development build', () => {
    expect(apiBaseUrl()).toBe('http://192.168.0.13:8787');
  });

  it('reads both full bundle URLs and Expo host:port values', () => {
    expect(hostFromUri('http://10.0.2.2:8081/index.bundle')).toBe('10.0.2.2');
    expect(hostFromUri('192.168.1.8:8081')).toBe('192.168.1.8');
  });

  it('falls back safely for an embedded file URL', () => {
    native.sourceCode.scriptURL = 'file:///private/var/containers/main.jsbundle';
    expect(apiBaseUrl()).toBe('http://localhost:8787');
  });
});
