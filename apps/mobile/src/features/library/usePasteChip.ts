import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';

// A URL on the clipboard that we have not offered yet. Checked on mount and each foreground.
export function usePasteChip() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let seen: string | null = null;
    const check = async () => {
      try {
        if (!(await Clipboard.hasUrlAsync())) return;
        const s = (await Clipboard.getStringAsync()).trim();
        if (s === seen || !/^https?:\/\/\S+$/i.test(s)) return;
        seen = s;
        setUrl(s);
      } catch { /* clipboard unavailable */ }
    };
    void check();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') void check(); });
    return () => sub.remove();
  }, []);
  return { url, dismiss: () => setUrl(null) };
}
