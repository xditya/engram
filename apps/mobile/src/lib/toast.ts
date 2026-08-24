import { create } from 'zustand';

type Action = { label: string; onPress: () => void; shake?: boolean }; // shake: the device can trigger it too

// One-line transient status ("Saved", "Let go · Undo"). Anything calls show(); the root layout renders it.
// Never on screen longer than 6 s: a plain toast shows for ~2.5 s, one carrying an action for 5–6 s.
export const useToast = create<{ message: string | null; action: Action | null; show(message: string, ms?: number, action?: Action): void; hide(): void }>((set) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    message: null,
    action: null,
    show(message, ms = 2500, action = undefined) {
      clearTimeout(timer);
      set({ message, action: action ?? null });
      timer = setTimeout(() => set({ message: null, action: null }), Math.min(action ? Math.max(ms, 5000) : ms, 6000));
    },
    hide: () => { clearTimeout(timer); set({ message: null, action: null }); },
  };
});
