import { execFileSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { etag } from 'hono/etag';
import { logger } from 'hono/logger';
import { estimate } from '@drop/water-engine';
import type { EstimateInput } from '@drop/water-engine';
import { FACTORS_VERSION, raw, rawTable, tables } from './data';
import { MODEL } from './services/openrouter';
import { searchCatalog } from './services/catalogMatch';
import { recognize } from './routes/recognize';
import { barcode } from './routes/barcode';
import { research } from './routes/research';

const app = new Hono();
app.use(logger());
app.use('/v1/catalog', etag());
app.use('/v1/factors/*', etag());

/** Every POST route parses a JSON body via c.req.json(); malformed or empty
 * bodies must surface as a clean 400, never a raw 500. c.req.json() caches
 * the parsed text internally, so routes downstream reuse this same read. */
app.use('*', async (c, next) => {
  if (c.req.method === 'POST') {
    try {
      await c.req.json();
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400);
    }
  }
  await next();
});

app.get('/v1/health', (c) => c.json({
  ok: true,
  factors_version: FACTORS_VERSION,
  catalog_version: raw.catalog.catalog_version,
  model: MODEL,
}));

app.get('/v1/manifest', (c) => c.json(raw.manifest));

app.get('/v1/catalog', (c) => {
  c.header('Cache-Control', 'public, max-age=86400');
  return c.json(raw.catalog);
});

app.get('/v1/factors/:table', (c) => {
  const t = rawTable(c.req.param('table'));
  if (!t) return c.json({ error: 'unknown table' }, 404);
  c.header('Cache-Control', 'public, max-age=86400');
  return c.json(t as object);
});

app.get('/v1/search', (c) => {
  const q = c.req.query('q') ?? '';
  return c.json({
    results: searchCatalog(q, tables, 12).map((e) => ({
      catalog_id: e.catalog_id,
      display_name: e.display_name,
      category: e.category,
      default_quantity: e.default_quantity,
    })),
  });
});

/** Parity/debug endpoint: same engine binary the app runs on-device. */
app.post('/v1/estimate', async (c) => {
  const input = await c.req.json<EstimateInput>();
  try {
    return c.json(estimate(input, tables));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

app.route('/v1/recognize', recognize);
app.route('/v1/barcode', barcode);
app.route('/v1/research', research);

/** Tailscale uses the 100.64.0.0/10 CGNAT range for device IPv4s. */
function isTailnetIp(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return a === 100 && b >= 64 && b <= 127;
}

/**
 * The address to serve on. The service speaks about what you are about to
 * consume, so it never listens outside the tailnet: `HOST` pins a specific
 * address, otherwise the Tailscale IPv4 is detected and used. Refuses to
 * serve rather than fall back to 0.0.0.0.
 */
function tailnetHost(): string {
  const pinned = process.env.HOST;
  if (pinned) return pinned;
  try {
    const out = execFileSync('tailscale', ['ip', '-4'], { timeout: 5000 }).toString();
    const first = out.trim().split(/\s+/)[0];
    if (first && isTailnetIp(first)) return first;
  } catch {
    // no tailscale binary; fall through to interface inspection
  }
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal && isTailnetIp(iface.address)) {
        return iface.address;
      }
    }
  }
  throw new Error('no Tailscale IPv4 found — cannot serve outside the tailnet');
}

// Tests import `app` for in-process requests (app.request(...)) and must
// not also bind a real port — vitest sets VITEST=true for every run.
if (process.env.VITEST !== 'true') {
  const port = Number(process.env.PORT ?? 8787);
  const hostname = tailnetHost();
  console.log(`Drop backend on http://${hostname}:${port} (tailnet only) — factors ${FACTORS_VERSION}`);
  serve({ fetch: app.fetch, port, hostname });
}

export { app };
