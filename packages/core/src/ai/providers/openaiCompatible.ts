import type { Provider, ProviderId } from '../types';
import { type Fetch, getJson, parseJsonLoose, postJson, safeTest, toBase64 } from '../http';

export type PresetId = Exclude<ProviderId, 'anthropic' | 'gemini' | 'on-device'>;
export interface Preset { baseUrl: string; chatModel: string; embedModel?: string; lan: boolean; needsKey: boolean; jsonMode: boolean }

export const PRESETS: Record<PresetId, Preset> = {
  openai: { baseUrl: 'https://api.openai.com/v1', chatModel: 'gpt-4o-mini', embedModel: 'text-embedding-3-small', lan: false, needsKey: true, jsonMode: true },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', chatModel: 'openai/gpt-4o-mini', embedModel: 'openai/text-embedding-3-small', lan: false, needsKey: true, jsonMode: true },
  ollama: { baseUrl: 'http://localhost:11434/v1', chatModel: 'llama3.2', embedModel: 'nomic-embed-text', lan: true, needsKey: false, jsonMode: true },
  lmstudio: { baseUrl: 'http://localhost:1234/v1', chatModel: 'local-model', embedModel: 'text-embedding-nomic-embed-text-v1.5', lan: true, needsKey: false, jsonMode: false },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', chatModel: 'llama-3.1-8b-instant', lan: false, needsKey: true, jsonMode: true },
  mistral: { baseUrl: 'https://api.mistral.ai/v1', chatModel: 'mistral-small-latest', embedModel: 'mistral-embed', lan: false, needsKey: true, jsonMode: true },
  custom: { baseUrl: '', chatModel: '', lan: true, needsKey: false, jsonMode: false },
};

export function openaiCompatible(opts: { id: PresetId; apiKey?: string; baseUrl?: string; chatModel?: string; embedModel?: string; fetch: Fetch }): Provider {
  const p = PRESETS[opts.id];
  const base = (opts.baseUrl ?? p.baseUrl).replace(/\/$/, '');
  const chat = opts.chatModel ?? p.chatModel;
  const embedModel = opts.embedModel ?? p.embedModel;
  const headers: Record<string, string> = opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {};
  const provider: Provider = {
    id: opts.id,
    capabilities: () => ({ chat: true, embed: !!embedModel, vision: true, summaries: true }),
    async complete(req) {
      const content: unknown = req.images?.length
        ? [...req.images.map((im) => ({ type: 'image_url', image_url: { url: `data:${im.mime};base64,${toBase64(im.bytes)}` } })), { type: 'text', text: req.user }]
        : req.user;
      const system = req.json && !p.jsonMode ? `${req.system}\nRespond with a single JSON object and nothing else.` : req.system;
      const res = await postJson(opts.fetch, `${base}/chat/completions`, headers, {
        model: chat, max_tokens: req.maxTokens,
        messages: [{ role: 'system', content: system }, { role: 'user', content }],
        ...(req.json && p.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      });
      const text: string = res.choices?.[0]?.message?.content ?? '';
      return req.json ? JSON.stringify(parseJsonLoose(text)) : text;
    },
    test: () => safeTest(async () => (await getJson(opts.fetch, `${base}/models`, headers)).data?.map((m: { id: string }) => m.id)),
  };
  if (embedModel) provider.embed = async (texts) => {
    const res = await postJson(opts.fetch, `${base}/embeddings`, headers, { model: embedModel, input: texts });
    const vectors = (res.data as { index: number; embedding: number[] }[]).sort((a, b) => a.index - b.index).map((d) => Float32Array.from(d.embedding));
    return { vectors, model: embedModel, dim: vectors[0]?.length ?? 0 };
  };
  return provider;
}
