import type { Provider } from '../types';
import { type Fetch, getJson, parseJsonLoose, postJson, safeTest, toBase64 } from '../http';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const GEMINI_EMBED_DIM = 768;

export function gemini(opts: { apiKey: string; chatModel?: string; embedModel?: string; fetch: Fetch }): Provider {
  const chat = opts.chatModel ?? 'gemini-3.6-flash';
  const embedModel = opts.embedModel ?? 'gemini-embedding-001';
  const headers = { 'x-goog-api-key': opts.apiKey };
  return {
    id: 'gemini',
    capabilities: () => ({ chat: true, embed: true, vision: true, summaries: true }),
    async complete(req) {
      const parts: unknown[] = (req.images ?? []).map((im) => ({ inlineData: { mimeType: im.mime, data: toBase64(im.bytes) } }));
      parts.push({ text: req.user });
      const res = await postJson(opts.fetch, `${BASE}/models/${chat}:generateContent`, headers, {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { maxOutputTokens: req.maxTokens, ...(req.json ? { responseMimeType: 'application/json' } : {}) },
      });
      const text: string = res.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
      return req.json ? JSON.stringify(parseJsonLoose(text)) : text;
    },
    async embed(texts) {
      const res = await postJson(opts.fetch, `${BASE}/models/${embedModel}:batchEmbedContents`, headers, {
        // gemini-embedding-001 returns 3072 values unless told otherwise; 768 keeps vectors the size search expects.
        requests: texts.map((t) => ({ model: `models/${embedModel}`, content: { parts: [{ text: t }] }, outputDimensionality: GEMINI_EMBED_DIM })),
      });
      const vectors = (res.embeddings as { values: number[] }[]).map((e) => Float32Array.from(e.values));
      return { vectors, model: embedModel, dim: vectors[0]?.length ?? GEMINI_EMBED_DIM };
    },
    test: () => safeTest(async () => (await getJson(opts.fetch, `${BASE}/models`, headers)).models?.map((m: { name: string }) => m.name)),
  };
}
