import { Platform as RN } from 'react-native';
import * as Device from 'expo-device';
import * as FS from 'expo-file-system/legacy';
import type { OnDeviceAI } from '@engram/core';

// react-native-executorch is loaded lazily: its import touches the native module, which web export lacks.
type Executorch = typeof import('react-native-executorch');
let mod: Executorch | undefined;
const executorch = (): Executorch => {
  if (mod) return mod;
  mod = require('react-native-executorch') as Executorch;
  // executorch has no built-in downloader: without a registered fetcher every fromModelName() throws
  // "ResourceFetcher adapter is not initialized". Ours only handles URLs, which is all the two models use.
  mod.initExecutorch({ resourceFetcher: { fetch: fetchSources, readAsString: (p) => FS.readAsStringAsync(`file://${p}`) } });
  return mod;
};

// Model files live in documents (not cache: 600 MB must not be evicted), keyed by the URL's file name.
const MODELS_DIR = `${FS.documentDirectory}executorch/`;
async function fetchSources(cb: (p: number) => void, ...sources: unknown[]): Promise<{ paths: string[]; wasDownloaded: boolean[] }> {
  await FS.makeDirectoryAsync(MODELS_DIR, { intermediates: true }).catch(() => {});
  const paths: string[] = [];
  const wasDownloaded: boolean[] = [];
  for (const src of sources) {
    if (typeof src !== 'string') throw new Error(`on-device: unsupported model source ${JSON.stringify(src)}`);
    const uri = MODELS_DIR + src.split('/').pop();
    const info = await FS.getInfoAsync(uri);
    if (info.exists && info.size > 0) { paths.push(uri.slice(7)); wasDownloaded.push(false); continue; }
    // Download beside the target and rename at the end so a killed app never leaves a truncated file that looks complete.
    const tmp = `${uri}.part`;
    const r = await FS.createDownloadResumable(src, tmp, {}, (d) => cb(d.totalBytesExpectedToWrite > 0 ? d.totalBytesWritten / d.totalBytesExpectedToWrite : 0)).downloadAsync();
    if (!r || r.status !== 200) throw new Error(`HTTP ${r?.status ?? 'error'} for ${src}`);
    await FS.moveAsync({ from: tmp, to: uri });
    cb(1);
    paths.push(uri.slice(7)); wasDownloaded.push(true);
  }
  return { paths, wasDownloaded };
}

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
// One app-wide instance downloads; whoever is showing the download (the settings screen) subscribes here.
let progress: OnDeviceProgress | undefined;
export const setOnDeviceProgress = (p: OnDeviceProgress | undefined) => { progress = p; };
// Message of the last failed ready(), for the toast; the interface only returns a boolean.
let lastError: string | undefined;
export const onDeviceLastError = () => lastError;

// First JSON object or array in a reply (models wrap it in prose or ``` fences); the reply itself if none.
function extractJson(s: string): string {
  const m = /[{[]/.exec(s);
  if (!m) return s;
  const open = m[0], close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false;
  for (let i = m.index; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { if (ch === '\\') i++; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return s.slice(m.index, i + 1);
  }
  return s.slice(m.index);
}

// Models download on first use (i.e. when the user enables on-device and the settings screen calls ready()).
// Qwen3 0.6B 4-bit (~500 MB) for classify, all-MiniLM-L6-v2 (~90 MB, 384-d) for embeddings.
export function createOnDevice(): OnDeviceAI | undefined {
  if (onDeviceUnavailableReason()) return undefined;
  const x = executorch();
  let llm: ReturnType<Executorch['LLMModule']['fromModelName']> | undefined;
  let emb: ReturnType<Executorch['TextEmbeddingsModule']['fromModelName']> | undefined;
  const getLlm = () => (llm ??= x.LLMModule.fromModelName(x.QWEN3_0_6B_QUANTIZED, (p) => progress?.('llm', p)));
  const getEmb = () => (emb ??= x.TextEmbeddingsModule.fromModelName(x.ALL_MINILM_L6_V2, (p) => progress?.('embed', p)));
  // ponytail: one generation at a time; the queue already runs on-device with concurrency 1.
  let busy: Promise<unknown> = Promise.resolve();

  const api: OnDeviceAI = {
    complete({ system, user, json }) {
      const run = async () => {
        const m = await getLlm();
        // Qwen3 "thinks" out loud in a <think> block before answering; /no_think turns that off (an empty block
        // may still be emitted), and the answer is cut down to its first JSON value when one was asked for.
        const sys = `${system}${json ? '\nRespond with a single JSON value and nothing else.' : ''} /no_think`;
        m.configure({ chatConfig: { systemPrompt: sys }, generationConfig: { temperature: 0.2, topP: 0.9 } });
        // maxTokens is not a runtime knob in executorch 0.9; the classify prompt is short by design.
        let raw: string;
        try { raw = await m.generate([{ role: 'system', content: sys }, { role: 'user', content: user }]); }
        catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new Error(/generate/i.test(msg) ? `the on-device model could not answer (${user.length > (api.contextChars ?? 3200) ? 'the prompt is longer than its window' : 'it may still be busy'})` : msg);
        }
        raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        return json ? extractJson(raw) : raw;
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
      try {
        const [m] = await Promise.all([getLlm(), getEmb()]);
        api.loaded = true; lastError = undefined;
        // The window is on the controller's native handle, not the public module; ~3.5 chars a token, and a
        // third of it kept for the chat template, the reply and the tokeniser's worse days.
        try {
          const tokens = (m as unknown as { controller?: { nativeModule?: { getMaxContextLength?(): number } } }).controller?.nativeModule?.getMaxContextLength?.();
          if (tokens && tokens > 0) api.contextChars = Math.floor(tokens * 3.5 * 0.66);
        } catch { /* stays undefined: the caller falls back to a conservative budget */ }
        return true;
      }
      catch (e) {
        llm = emb = undefined;
        lastError = e instanceof Error ? e.message : String(e);
        console.warn('on-device model load failed:', e);
        return false;
      }
    },
  };
  return api;
}
