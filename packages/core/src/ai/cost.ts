import type { ProviderId } from './types';
import { PRESETS } from './providers/openaiCompatible';

// USD per 1M tokens [input, output]. Rough; edit freely. Unknown models fall back to the provider's '*'.
export const PRICE: Partial<Record<ProviderId, Record<string, [number, number]>>> = {
  anthropic: { '*': [0.8, 4], 'claude-3-5-haiku-latest': [0.8, 4], 'claude-sonnet-4-5': [3, 15] },
  gemini: { '*': [0.1, 0.4], 'gemini-3.6-flash': [0.1, 0.4], 'gemini-embedding-001': [0, 0] },
  openai: { '*': [0.15, 0.6], 'gpt-4o-mini': [0.15, 0.6], 'gpt-4o': [2.5, 10], 'text-embedding-3-small': [0.02, 0] },
  openrouter: { '*': [0.15, 0.6] },
  groq: { '*': [0.05, 0.08] },
  mistral: { '*': [0.2, 0.6], 'mistral-embed': [0.1, 0] },
};

export const estimateTokens = (text: string | number): number => Math.ceil((typeof text === 'string' ? text.length : text) / 4);

export const isFree = (provider: ProviderId): boolean =>
  provider === 'on-device' || (provider in PRESETS && PRESETS[provider as keyof typeof PRESETS].lan);

const ON_DEVICE_SECONDS_PER_ITEM = 6; // mid-range phone classify; embed is negligible next to it

// outputTokens: classify returns ~120 tokens of JSON; pass 0 for embeddings.
export function estimateCost(count: number, avgChars: number, provider: ProviderId, model: string, outputTokens = 120): { usd: number; seconds?: number } {
  if (provider === 'on-device') return { usd: 0, seconds: count * ON_DEVICE_SECONDS_PER_ITEM };
  if (isFree(provider)) return { usd: 0 }; // LAN endpoint: free, but not on this phone
  const table = PRICE[provider] ?? {};
  const [inP, outP] = table[model] ?? table['*'] ?? [0.5, 1.5];
  return { usd: (count * (estimateTokens(avgChars) * inP + outputTokens * outP)) / 1e6 };
}
