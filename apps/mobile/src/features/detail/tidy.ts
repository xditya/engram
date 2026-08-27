import { notes } from '@engram/core';
import { askProvider } from '../search/useAsk';

// Turn a plain note into markdown: the configured model when there is one (it keeps the words, adds structure),
// the deterministic checklist otherwise. The caller shows Undo, so a wrong guess costs one tap.
export async function tidyNote(text: string): Promise<{ text: string; by: 'model' | 'rules' }> {
  const p = askProvider();
  if (p && !p.onDevice) {
    const out = (await p.provider.complete({ system: notes.TIDY_SYSTEM, user: text, maxTokens: 1200 })).trim().replace(/^```(?:markdown|md)?\n?|\n?```$/g, '');
    // A reply that dropped or invented words is not a tidy; fall back rather than rewrite the note.
    const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    const before = new Set(words(text)), after = words(out);
    const kept = after.filter((w) => before.has(w)).length;
    // A plain list of items is a checklist whatever the model decided; it only chooses when the note reads as prose.
    if (out && notes.looksLikeMarkdown(out) && kept >= before.size * 0.9 && after.length <= before.size * 1.3) return { text: notes.looksTidyable(text) ? notes.bulletsToChecklist(out) : out, by: 'model' };
  }
  return { text: notes.tidyPlain(text), by: 'rules' };
}
