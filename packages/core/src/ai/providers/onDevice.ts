import type { OnDeviceAI } from '../../platform';
import type { Provider } from '../types';

export const ON_DEVICE_EMBED_MODEL = 'on-device/bge-small';

export function onDevice(ai: OnDeviceAI): Provider {
  return {
    id: 'on-device',
    capabilities: () => ({ chat: true, embed: true, vision: false, summaries: false }),
    complete: (req) => ai.complete({ system: req.system, user: req.user, json: req.json, maxTokens: req.maxTokens }),
    async embed(texts) {
      const vectors = await ai.embed(texts);
      return { vectors, model: ON_DEVICE_EMBED_MODEL, dim: vectors[0]?.length ?? 0 };
    },
    test: async () => (await ai.ready()) ? { ok: true } : { ok: false, reason: 'on-device model not ready' },
  };
}
