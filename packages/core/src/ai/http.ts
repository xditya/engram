export type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

async function call(fetch: Fetch, url: string, init: { method?: string; headers: Record<string, string>; body?: string }): Promise<any> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

export const postJson = (fetch: Fetch, url: string, headers: Record<string, string>, body: unknown) =>
  call(fetch, url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

export const getJson = (fetch: Fetch, url: string, headers: Record<string, string>) => call(fetch, url, { headers });

// Models wrap JSON in ```json fences or chat around it; take the outermost {...}.
export function parseJsonLoose<T = any>(text: string): T {
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0 || e < s) throw new Error('no JSON object in response');
  return JSON.parse(text.slice(s, e + 1));
}

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function safeTest(fn: () => Promise<string[] | undefined>): Promise<{ ok: true; models?: string[] } | { ok: false; reason: string }> {
  try { return { ok: true, models: await fn() }; } catch (e) { return { ok: false, reason: (e as Error).message }; }
}
