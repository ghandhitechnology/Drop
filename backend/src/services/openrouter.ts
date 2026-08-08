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

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export type ChatJSONOptions = {
  messages: ChatMessage[];
  schemaName: string;
  schema: Record<string, unknown>;
  timeoutMs?: number;
  reasoningEffort?: ReasoningEffort;
  maxTokens?: number;
};

/** Where a call died. `status` is present only for `http`, i.e. only when
 * OpenRouter actually answered — that is what lets the retry rule separate a
 * dropped connection from a request the server refused on its merits. */
export type OpenRouterFailure = 'config' | 'network' | 'http' | 'response';

export class OpenRouterError extends Error {
  readonly kind: OpenRouterFailure;
  readonly status?: number;

  constructor(kind: OpenRouterFailure, message: string, status?: number) {
    super(message);
    this.name = 'OpenRouterError';
    this.kind = kind;
    this.status = status;
  }
}

/** A second call can only clear a failure that wasn't about the request
 * itself: a transport blip, or OpenRouter's own 5xx. A missing key, a 4xx
 * schema rejection, an empty choice, or an unparseable body all reproduce
 * exactly, so retrying them just doubles the latency before the same error. */
export function isTransient(err: unknown): boolean {
  if (!(err instanceof OpenRouterError)) return false;
  if (err.kind === 'network') return true;
  return err.kind === 'http' && err.status !== undefined && err.status >= 500;
}

export async function chatJSON(opts: ChatJSONOptions): Promise<unknown> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new OpenRouterError('config', 'OPENROUTER_API_KEY is not set');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  try {
    let res: Response;
    try {
      res = await fetch(API_URL, {
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
          ...(opts.maxTokens === undefined ? {} : { max_tokens: opts.maxTokens }),
          ...(opts.reasoningEffort === undefined
            ? {}
            : {
                reasoning: {
                  effort: opts.reasoningEffort,
                  exclude: true,
                },
              }),
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
    } catch (err) {
      // The timeout aborts through this same path. It is the caller's
      // deadline rather than a transport failure, so it travels untouched
      // and stays unretryable.
      if ((err as Error).name === 'AbortError') throw err;
      throw new OpenRouterError(
        'network', `OpenRouter fetch failed: ${(err as Error).message}`,
      );
    }
    if (!res.ok) {
      const body = await res.text();
      throw new OpenRouterError(
        'http', `OpenRouter ${res.status}: ${body.slice(0, 300)}`, res.status,
      );
    }
    const data = await res.json() as {
      choices: { message: { content: string } }[];
    };
    const content = data.choices[0]?.message?.content;
    if (!content) throw new OpenRouterError('response', 'empty model response');
    return JSON.parse(content);
  } finally {
    clearTimeout(timer);
  }
}

/** One retry, only for failures a second call could plausibly clear.
 * AbortError and JSON.parse failures are not OpenRouterError at all, so
 * isTransient rejects them and they rethrow immediately. */
export async function chatJSONRetry(
  opts: Parameters<typeof chatJSON>[0],
): Promise<unknown> {
  try {
    return await chatJSON(opts);
  } catch (err) {
    if (!isTransient(err)) throw err;
    return await chatJSON(opts);
  }
}
