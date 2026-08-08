/** Thin OpenRouter client. The model classifies and estimates quantity —
 * footprint numbers are computed by the water engine, never by the model. */

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const MODEL = 'openai/gpt-5.6-luna';

export interface ChatMessage {
  role: 'system' | 'user';
  content:
    | string
    | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >;
}

export async function chatJSON(opts: {
  messages: ChatMessage[];
  schemaName: string;
  schema: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<unknown> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not set');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://drop.local',
        'X-Title': 'Drop',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        messages: opts.messages,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: opts.schemaName,
            strict: true,
            schema: opts.schema,
          },
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json() as {
      choices: { message: { content: string } }[];
    };
    const content = data.choices[0]?.message?.content;
    if (!content) throw new Error('empty model response');
    return JSON.parse(content);
  } finally {
    clearTimeout(timer);
  }
}

/** One retry on transient failure. */
export async function chatJSONRetry(
  opts: Parameters<typeof chatJSON>[0],
): Promise<unknown> {
  try {
    return await chatJSON(opts);
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    return await chatJSON(opts);
  }
}
