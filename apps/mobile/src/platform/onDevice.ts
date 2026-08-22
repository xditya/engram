import { Platform as RN } from 'react-native';
import * as Device from 'expo-device';
import type { OnDeviceAI } from '@engram/core';

// react-native-executorch is loaded lazily: its import touches the native module, which web export lacks.
type Executorch = typeof import('react-native-executorch');
let mod: Executorch | undefined;
const executorch = (): Executorch => (mod ??= require('react-native-executorch') as Executorch);

const MIN_RAM = 3 * 1024 ** 3;

// Why "On this device" is not offered, or undefined when it is. Shown verbatim by the Intelligence settings.
export function onDeviceUnavailableReason(): string | undefined {
  if (RN.OS === 'web') return 'On-device intelligence needs the native app.';
  try { if (!executorch().isAvailable) return 'This build was made without the on-device runtime.'; }
  catch { return 'This build was made without the on-device runtime.'; }
  if (Device.totalMemory != null && Device.totalMemory < MIN_RAM) return 'This device has less than 3 GB of memory.';
  return undefined;
}

// ponytail: RAM-only capability check. The 10-item self-test from the benchmark spec decides
// Recommended vs Experimental; add it to the settings screen when both model downloads are wired to a UI.
export const onDeviceTier = (): 'recommended' | 'experimental' =>
  (Device.totalMemory ?? 0) >= 4 * 1024 ** 3 ? 'recommended' : 'experimental';

export type OnDeviceProgress = (what: 'llm' | 'embed', fraction: number) => void;

// Models download on first use (i.e. when the user enables on-device and the settings screen calls ready()).
// Qwen3 0.6B 4-bit (~500 MB) for classify, all-MiniLM-L6-v2 (~90 MB, 384-d) for embeddings.
export function createOnDevice(onProgress?: OnDeviceProgress): OnDeviceAI | undefined {
  if (onDeviceUnavailableReason()) return undefined;
  const x = executorch();
  let llm: ReturnType<Executorch['LLMModule']['fromModelName']> | undefined;
  let emb: ReturnType<Executorch['TextEmbeddingsModule']['fromModelName']> | undefined;
  const getLlm = () => (llm ??= x.LLMModule.fromModelName(x.QWEN3_0_6B_QUANTIZED, (p) => onProgress?.('llm', p)));
  const getEmb = () => (emb ??= x.TextEmbeddingsModule.fromModelName(x.ALL_MINILM_L6_V2, (p) => onProgress?.('embed', p)));
  // ponytail: one generation at a time; the queue already runs on-device with concurrency 1.
  let busy: Promise<unknown> = Promise.resolve();

  return {
    complete({ system, user, json }) {
      const run = async () => {
        const m = await getLlm();
        const sys = json ? `${system}\nRespond with a single JSON value and nothing else.` : system;
        m.configure({ chatConfig: { systemPrompt: sys }, generationConfig: { temperature: 0.2, topP: 0.9 } });
        // maxTokens is not a runtime knob in executorch 0.9; the classify prompt is short by design.
        return m.generate([{ role: 'system', content: sys }, { role: 'user', content: user }]);
      };
      const p = busy.then(run, run);
      busy = p.catch(() => {});
      return p;
    },
    async embed(texts) {
      const m = await getEmb();
      const out: Float32Array[] = [];
      for (const t of texts) out.push(await m.forward(t));
      return out;
    },
    async ready() {
      try { await Promise.all([getLlm(), getEmb()]); return true; }
      catch { llm = emb = undefined; return false; }
    },
  };
}
