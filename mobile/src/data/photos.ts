/**
 * Permanent storage for confirmed camera captures.
 *
 * Expo Camera returns a cache URI. It is safe for immediate recognition and
 * presentation, but iOS may evict it after the app leaves the foreground. A
 * confirmed history entry therefore gets its own copy under Documents.
 */
import { Directory, File, Paths } from 'expo-file-system';

const CAPTURES = new Directory(Paths.document, 'captures');

function extensionOf(file: File): string {
  const extension = file.extension.toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : '.jpg';
}

export async function persistCapturedPhoto(uri: string, entryId: string): Promise<string> {
  const source = new File(uri);
  if (!source.exists) throw new Error('captured photo no longer exists');

  CAPTURES.create({ idempotent: true, intermediates: true });
  const destination = new File(CAPTURES, `${entryId}${extensionOf(source)}`);
  await source.copy(destination, { overwrite: true });
  return destination.uri;
}

/** Remove a copied photo when its database write fails. */
export function discardCapturedPhoto(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Cleanup must never hide the database failure that triggered it.
  }
}
