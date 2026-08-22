import type { IntelligenceSettings } from '../../model/types';
import type { OnDeviceAI } from '../../platform';
import type { Provider } from '../types';
import type { Fetch } from '../http';
import { anthropic } from './anthropic';
import { gemini } from './gemini';
import { openaiCompatible, PRESETS } from './openaiCompatible';
import { onDevice } from './onDevice';

export { anthropic, gemini, openaiCompatible, onDevice, PRESETS };

// null: mode off, or the settings can't be satisfied (missing key / on-device unavailable).
export function createProvider(settings: IntelligenceSettings, secrets: { apiKey?: string }, deps: { fetch: Fetch; onDevice?: OnDeviceAI }): Provider | null {
  if (settings.mode === 'off') return null;
  if (settings.mode === 'on-device') return deps.onDevice ? onDevice(deps.onDevice) : null;
  const provider = settings.provider ?? 'openai';
  const { apiKey } = secrets;
  const { fetch } = deps;
  if (provider === 'anthropic') return apiKey ? anthropic({ apiKey, chatModel: settings.chatModel, fetch }) : null;
  if (provider === 'gemini') return apiKey ? gemini({ apiKey, chatModel: settings.chatModel, embedModel: settings.embedModel, fetch }) : null;
  if (PRESETS[provider].needsKey && !apiKey) return null;
  return openaiCompatible({ id: provider, apiKey, baseUrl: settings.baseUrl, chatModel: settings.chatModel, embedModel: settings.embedModel, fetch });
}

// Anthropic has no embeddings; embedProvider 'on-device' pairs it with the local embedder.
export function createEmbedder(settings: IntelligenceSettings, main: Provider | null, deps: { onDevice?: OnDeviceAI }): Provider | null {
  if (settings.embedProvider === 'on-device') return deps.onDevice ? onDevice(deps.onDevice) : null;
  return main?.embed ? main : null;
}
