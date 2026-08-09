/**
 * The credits, checked against the tables actually in the bundle.
 *
 * These assertions run over the real factor tables rather than fixtures, which
 * is the whole point: the about block claims to name every dataset behind a
 * litre, and the only way that claim stays true is if a release that renames a
 * dataset, drops a rights line, or adds a table breaks this file.
 */
import { describe, expect, it } from 'vitest';

import { rawTables } from '../../../data/tables';
import { catalogSize, datasetCredits } from '../datasets';
import { parsePreferences } from '../persist';

const labels = {
  release: (value: string) => `Release · ${value}`,
  rights: (value: string) => `Rights · ${value}`,
  source: (value: string) => `Source · ${value}`,
};

describe('datasetCredits', () => {
  const credits = datasetCredits(labels);

  it('covers every factor table the engine reads', () => {
    // `manifest` and `catalog` are not factor tables — they carry no litres.
    const factorTables = Object.keys(rawTables).filter(
      (key) => key !== 'manifest' && key !== 'catalog',
    );
    expect(credits.map((c) => c.id).sort()).toEqual(factorTables.sort());
  });

  it('names each dataset and counts its rows', () => {
    const byId = Object.fromEntries(credits.map((c) => [c.id, c]));
    expect(byId.food_sueatable.name).toBe('SuEatableLife');
    expect(byId.food_sueatable.rows).toBe(320);
    expect(byId.food_hestia_country.rows).toBe(140);
    expect(byId.food_owid_proxy.rows).toBe(38);
    expect(byId.transport_factors.rows).toBe(12);
    expect(byId.sector_useeio.rows).toBe(411);
  });

  it('gives every dataset at least a release and one attribution line', () => {
    for (const credit of credits) {
      expect(credit.lines.length).toBeGreaterThanOrEqual(2);
      expect(credit.lines[0].value.startsWith('Release · ')).toBe(true);
      for (const line of credit.lines) {
        expect(line.value.length).toBeGreaterThan(10);
      }
    }
  });

  it('quotes the rights the tables publish, verbatim', () => {
    const rights = Object.fromEntries(
      credits.map((c) => [c.id, c.lines.find((l) => l.label === 'rights')?.value]),
    );
    expect(rights.food_sueatable).toBe('Rights · CC BY 4.0');
    expect(rights.food_hestia_country).toBe('Rights · HESTIA open data (hestia.earth)');
    expect(rights.food_owid_proxy).toBe('Rights · CC BY (Our World in Data)');
    expect(rights.sector_useeio).toBe('Rights · US EPA, public domain');
  });

  /**
   * The transport table publishes no rights string, so nothing may be invented
   * in its place. What it does carry is provenance — the activity record and
   * the study behind the water intensity — and those are shown instead.
   */
  it('credits transport by its provenance, since it publishes no rights line', () => {
    const transport = credits.find((c) => c.id === 'transport_factors')!;
    expect(transport.lines.map((l) => l.label)).toEqual(['release', 'source']);
    expect(transport.lines[0].value).toContain('USLCI FY2025 Q2');
    expect(transport.lines[0].value).toContain('Federal LCA Commons');
    expect(transport.lines[1].value).toContain('Wu, M.');
    expect(transport.lines.some((l) => l.label === 'rights')).toBe(false);
  });

  it('puts the food tables first and the economic proxy last', () => {
    expect(credits[0].id).toBe('food_sueatable');
    expect(credits[credits.length - 1].id).toBe('sector_useeio');
  });
});

describe('catalogSize', () => {
  it('counts the things Drop knows by name', () => {
    expect(catalogSize()).toBe(1000);
  });
});

describe('parsePreferences', () => {
  it('reads a blob it wrote itself', () => {
    const stored = JSON.stringify({
      theme: 'saltyOcean1',
      scheme: 'dark',
      motion: 'reduced',
      texture: false,
      legibleText: true,
    });
    expect(parsePreferences(stored)).toEqual({
      theme: 'saltyOcean1',
      scheme: 'dark',
      motion: 'reduced',
      texture: false,
      legibleText: true,
    });
  });

  it('takes nothing from an absent or unreadable blob', () => {
    expect(parsePreferences(null)).toEqual({});
    expect(parsePreferences('')).toEqual({});
    expect(parsePreferences('{')).toEqual({});
    expect(parsePreferences('"dark"')).toEqual({});
    expect(parsePreferences('null')).toEqual({});
  });

  /**
   * A value this build does not understand must never reach the theme — the
   * field falls back to its authored default while the rest of the blob is
   * still honoured.
   */
  it('drops fields it does not understand and keeps the ones it does', () => {
    const stored = JSON.stringify({
      theme: 'neon',
      scheme: 'sepia',
      motion: 'reduced',
      texture: 'off',
      legibleText: 1,
    });
    expect(parsePreferences(stored)).toEqual({ motion: 'reduced' });
  });

  it('keeps false apart from missing', () => {
    expect(parsePreferences(JSON.stringify({ texture: false }))).toEqual({
      texture: false,
    });
    expect(parsePreferences(JSON.stringify({}))).toEqual({});
  });

  it('accepts every authored theme family', () => {
    expect(parsePreferences(JSON.stringify({ theme: 'default' }))).toEqual({
      theme: 'default',
    });
    expect(parsePreferences(JSON.stringify({ theme: 'saltyOcean1' }))).toEqual({
      theme: 'saltyOcean1',
    });
    expect(parsePreferences(JSON.stringify({ theme: 'absolutely' }))).toEqual({
      theme: 'absolutely',
    });
  });

  it('migrates retired Salty ocean variants to the chosen palette', () => {
    for (const theme of [
      'saltyOcean',
      'saltyOcean2',
      'saltyOcean3',
      'saltyOcean4',
      'saltyOcean5',
      'saltyOcean6',
      'saltyOcean7',
    ]) {
      expect(parsePreferences(JSON.stringify({ theme }))).toEqual({
        theme: 'saltyOcean1',
      });
    }
  });
});
