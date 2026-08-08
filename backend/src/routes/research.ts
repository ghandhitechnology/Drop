import { Hono } from 'hono';
import { tables } from '../data';
import { chatJSONRetry } from '../services/openrouter';

/** Retrieved evidence stays structurally separate from validated factors:
 * `may_be_used_as_factor` is a literal false and the engine never imports
 * these types. The app renders this in its own visually distinct block. */

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['evidence', 'summary'],
  properties: {
    summary: { type: 'string' },
    evidence: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claim', 'source_title', 'source_publisher', 'year', 'reliability'],
        properties: {
          claim: { type: 'string' },
          value: { type: ['number', 'null'] },
          unit: { type: ['string', 'null'] },
          metric_type: { type: ['string', 'null'] },
          geography: { type: ['string', 'null'] },
          year: { type: ['integer', 'null'] },
          source_title: { type: 'string' },
          source_publisher: { type: 'string' },
          reliability: {
            type: 'string',
            enum: ['peer_reviewed', 'report', 'database', 'news', 'unclear'],
          },
        },
      },
    },
  },
} as const;

export const research = new Hono();

research.post('/', async (c) => {
  const body = await c.req.json<{ catalog_id?: string; question?: string }>();
  const entry = body.catalog_id ? tables.catalog.get(body.catalog_id) : null;
  const question = body.question
    ?? (entry ? `water footprint of ${entry.display_name}` : null);
  if (!question) return c.json({ error: 'question or catalog_id required' }, 400);

  const out = await chatJSONRetry({
    schemaName: 'research_evidence',
    timeoutMs: 30_000,
    schema: SCHEMA as unknown as Record<string, unknown>,
    messages: [
      {
        role: 'system',
        content:
          'You collect published evidence about water footprints. Report ' +
          'claims with their sources, publication years, and metric types ' +
          '(total water footprint vs freshwater withdrawal vs scarcity-' +
          'weighted). Cite only sources you are confident exist. Where ' +
          'evidence is thin, say so in the summary.',
      },
      { role: 'user', content: question },
    ],
  }) as { summary: string; evidence: unknown[] };

  return c.json({
    request_id: `res_${Date.now().toString(36)}`,
    question,
    summary: out.summary,
    evidence: out.evidence,
    status: 'unverified_evidence',
    may_be_used_as_factor: false as const,
  });
});
