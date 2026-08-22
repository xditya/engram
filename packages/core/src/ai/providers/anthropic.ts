import type { Provider } from '../types';
import { type Fetch, getJson, parseJsonLoose, postJson, safeTest, toBase64 } from '../http';

const BASE = 'https://api.anthropic.com/v1';

export function anthropic(opts: { apiKey: string; chatModel?: string; fetch: Fetch }): Provider {
  const model = opts.chatModel ?? 'claude-3-5-haiku-latest';
  const headers = { 'x-api-key': opts.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
  return {
    id: 'anthropic',
    capabilities: () => ({ chat: true, embed: false, vision: true, summaries: true }),
    async complete(req) {
      const content: unknown[] = (req.images ?? []).map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mime, data: toBase64(im.bytes) } }));
      content.push({ type: 'text', text: req.user });
      const system = req.json ? `${req.system}\nRespond with a single JSON object and nothing else.` : req.system;
      const res = await postJson(opts.fetch, `${BASE}/messages`, headers, { model, max_tokens: req.maxTokens, system, messages: [{ role: 'user', content }] });
      const text = (res.content as { type: string; text?: string }[]).filter((c) => c.type === 'text').map((c) => c.text).join('');
      return req.json ? JSON.stringify(parseJsonLoose(text)) : text;
    },
    test: () => safeTest(async () => (await getJson(opts.fetch, `${BASE}/models`, headers)).data?.map((m: { id: string }) => m.id)),
  };
}
