import { Skia, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useSyncExternalStore } from 'react';
import { Image as RNImage } from 'react-native';

import { POSE_IDS, POSE_SOURCES, type PoseId } from './poses';

/**
 * One decode per pose, shared by every avatar on screen.
 *
 * `useImage` from Skia decodes per hook call, which would mean a fresh decode
 * for every row of a history list. The poses are a small fixed set, so they are
 * decoded once into a module-level cache and handed to all subscribers.
 */

export type PoseImages = Record<PoseId, SkImage | null>;

const EMPTY: PoseImages = Object.fromEntries(
  POSE_IDS.map((id) => [id, null]),
) as PoseImages;

const cache = new Map<PoseId, SkImage>();
const listeners = new Set<() => void>();

let snapshot: PoseImages = EMPTY;
let started = false;

function publish() {
  snapshot = Object.fromEntries(
    POSE_IDS.map((id) => [id, cache.get(id) ?? null]),
  ) as PoseImages;
  listeners.forEach((listener) => listener());
}

async function decode(id: PoseId) {
  const asset = RNImage.resolveAssetSource(POSE_SOURCES[id]);
  if (!asset?.uri) return;
  const data = await Skia.Data.fromURI(asset.uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (image) cache.set(id, image);
}

/**
 * Kicks off the decode of the whole pose set. Safe to call any number of times.
 * Poses land as they finish, and each arrival publishes — so the first pose to
 * decode can already be drawn while the rest are still coming.
 */
export function loadCharacterImages() {
  if (started) return;
  started = true;
  POSE_IDS.forEach((id) => {
    decode(id)
      .then(publish)
      .catch(() => {
        // A missing pose simply leaves that slot null; the avatar draws the
        // poses it has and picks the rest up on the next launch.
      });
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): PoseImages {
  return snapshot;
}

/** The decoded pose set, re-rendering as poses arrive. */
export function useCharacterImages(): PoseImages {
  useEffect(loadCharacterImages, []);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
