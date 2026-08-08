/**
 * Barcode normalisation — the single place a scan becomes a lookup key.
 *
 * Nothing downstream branches on platform. Every scanner quirk is flattened
 * here into one `BarcodeHint` with a canonical GTIN-14.
 */

import type { BarcodeScanningResult } from 'expo-camera';

import type { BarcodeHint, Rect, Symbology } from './types';
import { BARCODE_SYMBOLOGIES } from './types';

/** The symbologies the camera is asked to look for. */
export const SCANNED_TYPES: readonly Symbology[] = BARCODE_SYMBOLOGIES;

const DIGITS_ONLY = /^\d+$/;

/** GS1 mod-10 check digit over every digit except the last. */
function checkDigit(body: string): number {
  let sum = 0;
  // Weights alternate 3,1 reading right-to-left from the digit before the check.
  for (let i = body.length - 1, weight = 3; i >= 0; i -= 1, weight = weight === 3 ? 1 : 3) {
    sum += Number(body[i]) * weight;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidGtin(digits: string): boolean {
  if (!DIGITS_ONLY.test(digits) || digits.length < 8) return false;
  return checkDigit(digits.slice(0, -1)) === Number(digits[digits.length - 1]);
}

/**
 * Expand a zero-suppressed UPC-E code to its full UPC-A form.
 *
 * Input is `N S1 S2 S3 S4 S5 S6 C`; S6 selects the expansion rule.
 * Worked example: `04252614` → number system 0, body `425261`, check 4,
 * S6 = 1 so the rule is `N S1 S2 S6 0000 S3 S4 S5 C` → `042100005264`.
 */
export function expandUpcE(upcE: string): string | null {
  if (upcE.length !== 8 || !DIGITS_ONLY.test(upcE)) return null;
  const system = upcE[0];
  if (system !== '0' && system !== '1') return null;
  const [s1, s2, s3, s4, s5, s6] = upcE.slice(1, 7);
  const check = upcE[7];

  let middle: string;
  switch (s6) {
    case '0':
    case '1':
    case '2':
      middle = `${s1}${s2}${s6}0000${s3}${s4}${s5}`;
      break;
    case '3':
      middle = `${s1}${s2}${s3}00000${s4}${s5}`;
      break;
    case '4':
      middle = `${s1}${s2}${s3}${s4}00000${s5}`;
      break;
    default:
      middle = `${s1}${s2}${s3}${s4}${s5}0000${s6}`;
      break;
  }
  return `${system}${middle}${check}`;
}

/** Left-pad any GTIN to the 14-digit canonical form. */
export function toGtin14(digits: string): string {
  return digits.padStart(14, '0');
}

function rectFrom(result: BarcodeScanningResult): Rect | null {
  const bounds = result.bounds;
  if (!bounds) return null;
  const { origin, size } = bounds;
  if (!origin || !size) return null;
  if (!(size.width > 0) || !(size.height > 0)) return null;
  return { x: origin.x, y: origin.y, width: size.width, height: size.height };
}

/**
 * Turn a raw scan into a hint, or `null` when the code is outside the four
 * retail symbologies Drop reads.
 *
 * The one platform fix-up: iOS reports a UPC-A scan as `ean13` with a leading
 * zero glued on. That is recognised here and reported as `upc_a` with its
 * native 12 digits, so an iOS scan and an Android scan of the same tin produce
 * an identical hint.
 */
export function normalizeBarcode(result: BarcodeScanningResult): BarcodeHint | null {
  const digits = (result.data ?? '').replace(/\D/g, '');
  if (!DIGITS_ONLY.test(digits)) return null;

  const reported = result.type as string;
  const bounds = rectFrom(result);

  let symbology: Symbology;
  let value = digits;

  if (reported === 'ean13' && digits.length === 13 && digits.startsWith('0')) {
    symbology = 'upc_a';
    value = digits.slice(1);
  } else if (reported === 'ean13' && digits.length === 13) {
    symbology = 'ean13';
  } else if (reported === 'ean8' && digits.length === 8) {
    symbology = 'ean8';
  } else if (reported === 'upc_a' && digits.length === 12) {
    symbology = 'upc_a';
  } else if (reported === 'upc_e' && digits.length === 8) {
    symbology = 'upc_e';
  } else if (reported === 'upc_e' && digits.length === 12) {
    // Android sometimes hands back an already-expanded UPC-E.
    symbology = 'upc_a';
  } else {
    return null;
  }

  const expanded = symbology === 'upc_e' ? expandUpcE(value) : value;
  if (!expanded) return null;

  return { symbology, value, gtin14: toGtin14(expanded), bounds };
}

/** Two hints point at the same product when their canonical keys agree. */
export function sameBarcode(a: BarcodeHint | undefined, b: BarcodeHint): boolean {
  return a?.gtin14 === b.gtin14;
}
