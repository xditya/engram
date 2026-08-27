import { ai, type IntelligenceSettings, type ProviderId } from '@engram/core';
import { getSettings, type Engram } from '../../lib/engram';

export type KeyProvider = NonNullable<IntelligenceSettings['provider']>;
export type Check =
  | { state: 'idle' } | { state: 'checking' } | { state: 'ok'; model: string; host?: string }
  | { state: 'rejected' } | { state: 'unreachable'; host: string };

export const KEY_PAGES: Record<string, { name: string; url: string }> = {
  anthropic: { name: 'Anthropic', url: 'https://console.anthropic.com/settings/keys' },
  openai: { name: 'OpenAI', url: 'https://platform.openai.com/api-keys' },
  gemini: { name: 'Google AI Studio', url: 'https://aistudio.google.com/apikey' },
  openrouter: { name: 'OpenRouter', url: 'https://openrouter.ai/keys' },
  groq: { name: 'Groq', url: 'https://console.groq.com/keys' },
  mistral: { name: 'Mistral', url: 'https://console.mistral.ai/api-keys' },
};
const DEFAULT_MODEL: Record<string, string> = { anthropic: 'claude-haiku-4-5', gemini: 'gemini-3.6-flash' };

export const modelOf = (s: IntelligenceSettings): string =>
  s.chatModel || DEFAULT_MODEL[s.provider ?? ''] || (s.provider && s.provider in ai.PRESETS ? ai.PRESETS[s.provider as keyof typeof ai.PRESETS].chatModel : '');

export const hostOf = (s: IntelligenceSettings): string => {
  const base = s.baseUrl || (s.provider && s.provider in ai.PRESETS ? ai.PRESETS[s.provider as keyof typeof ai.PRESETS].baseUrl : '');
  try { return new URL(base).host; } catch { return KEY_PAGES[s.provider ?? '']?.name ?? 'the endpoint'; }
};

// One round-trip to the provider's model list; the core provider decides the URL and auth header.
export async function checkKey(s: IntelligenceSettings, apiKey: string): Promise<Check> {
  const p = ai.createProvider({ ...s, mode: 'key' }, { apiKey: apiKey || undefined }, { fetch });
  if (!p) return { state: 'idle' };
  const r = await p.test();
  const host = hostOf(s);
  if (r.ok) {
    const want = modelOf(s);
    const model = r.models?.find((m) => m === want) ?? want ?? r.models?.[0] ?? '';
    return { state: 'ok', model, host: s.provider === 'custom' || ai.PRESETS[s.provider as keyof typeof ai.PRESETS]?.lan ? host : undefined };
  }
  return /\b(401|403|invalid|unauthori[sz]ed|api key)\b/i.test(r.reason) ? { state: 'rejected' } : { state: 'unreachable', host };
}

// Saves never tagged by Intelligence, and what a backfill would cost with the current provider.
// "Untagged" means no classify job has finished for the item: autotag also writes source 'ai', so tag rows can't tell.
const UNTAGGED = "deleted_at IS NULL AND id NOT IN (SELECT item_id FROM jobs WHERE kind = 'classify' AND status = 'done')";

export function backfill(e: Engram, all = false): { count: number; usd: number; seconds?: number; queued: number } {
  const sql = e.platform.db;
  const row = sql.query<{ n: number; chars: number }>(
    `SELECT count(*) n, coalesce(avg(length(coalesce(title,'')) + length(coalesce(body,''))), 0) chars FROM items WHERE ${all ? 'deleted_at IS NULL' : UNTAGGED}`,
  )[0] ?? { n: 0, chars: 0 };
  const queued = sql.query<{ n: number }>("SELECT count(*) n FROM jobs WHERE kind = 'classify' AND status IN ('pending','running')")[0]?.n ?? 0;
  return { count: row.n, queued, ...estimate(row.n, row.chars) };
}

export function estimate(count: number, avgChars: number): { usd: number; seconds?: number } {
  const s = getSettings().intelligence;
  const provider: ProviderId = s.mode === 'on-device' ? 'on-device' : (s.provider ?? 'openai');
  return ai.estimateCost(count, Math.round(avgChars) + 400, provider, modelOf(s));
}

// Enqueue classify + embed for every untagged save (or every save). Never called automatically.
export function startBackfill(e: Engram, all = false): number {
  const ids = e.platform.db.query<{ id: string }>(
    `SELECT id FROM items WHERE ${all ? 'deleted_at IS NULL' : UNTAGGED} AND id NOT IN (SELECT item_id FROM jobs WHERE kind = 'classify' AND status IN ('pending','running'))`,
  );
  for (const { id } of ids) e.queue.enqueueFor(id, ['classify', 'embed']);
  void e.drain();
  return ids.length;
}

export function stopBackfill(e: Engram) {
  e.platform.db.exec("DELETE FROM jobs WHERE kind IN ('classify','embed') AND status = 'pending'");
}

export const costLine = (usd: number, seconds: number | undefined, model: string): string =>
  seconds != null ? `Free · about ${Math.max(1, Math.round(seconds / 60))} min on this device`
    : usd === 0 ? `Free with ${model || 'the default model'}`
    : `≈ $${usd < 0.01 && usd > 0 ? '0.01' : usd.toFixed(2)} with ${model || 'the default model'}`;
