import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const KEY = 'drop.installation-id.v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let pending: Promise<string> | null = null;

async function loadOrCreate(): Promise<string> {
  if (!(await SecureStore.isAvailableAsync())) {
    throw new Error('secure installation identity is unavailable');
  }
  const stored = await SecureStore.getItemAsync(KEY);
  if (stored && UUID.test(stored)) return stored;
  const created = Crypto.randomUUID();
  await SecureStore.setItemAsync(KEY, created, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return created;
}

export function installationId(): Promise<string> {
  if (!pending) {
    pending = loadOrCreate().catch((error) => {
      pending = null;
      throw error;
    });
  }
  return pending;
}
