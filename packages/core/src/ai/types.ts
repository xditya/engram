export type ProviderId =
  | 'anthropic' | 'gemini' | 'openai' | 'openrouter' | 'ollama' | 'lmstudio'
  | 'groq' | 'mistral' | 'custom' | 'on-device';

export interface Provider {
  id: ProviderId;
  complete(req: {
    system: string;
    user: string;
    json?: boolean;
    maxTokens: number;
    images?: { bytes: Uint8Array; mime: string }[];
  }): Promise<string>;
  embed?(texts: string[]): Promise<{ vectors: Float32Array[]; model: string; dim: number }>;
  capabilities(): { chat: boolean; embed: boolean; vision: boolean; summaries: boolean };
  test(): Promise<{ ok: true; models?: string[] } | { ok: false; reason: string }>;
}
