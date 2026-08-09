import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  available: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  uuid: vi.fn(),
}));

vi.mock('expo-crypto', () => ({ randomUUID: native.uuid }));
vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
  isAvailableAsync: native.available,
  getItemAsync: native.get,
  setItemAsync: native.set,
}));

const STORED = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CREATED = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('installation identity', () => {
  beforeEach(() => {
    vi.resetModules();
    native.available.mockReset().mockResolvedValue(true);
    native.get.mockReset().mockResolvedValue(null);
    native.set.mockReset().mockResolvedValue(undefined);
    native.uuid.mockReset().mockReturnValue(CREATED);
  });

  it('loads one stored UUID and reuses it for the process lifetime', async () => {
    native.get.mockResolvedValue(STORED);
    const { installationId } = await import('../identity');

    await expect(installationId()).resolves.toBe(STORED);
    await expect(installationId()).resolves.toBe(STORED);
    expect(native.get).toHaveBeenCalledOnce();
    expect(native.uuid).not.toHaveBeenCalled();
  });

  it('creates and persists one device-only UUID when none exists', async () => {
    const { installationId } = await import('../identity');

    await expect(installationId()).resolves.toBe(CREATED);
    expect(native.set).toHaveBeenCalledWith('drop.installation-id.v1', CREATED, {
      keychainAccessible: 'device-only',
    });
  });

  it('fails closed when secure identity storage is unavailable', async () => {
    native.available.mockResolvedValue(false);
    const { installationId } = await import('../identity');

    await expect(installationId()).rejects.toThrow('secure installation identity is unavailable');
    expect(native.uuid).not.toHaveBeenCalled();
    expect(native.set).not.toHaveBeenCalled();
  });
});
