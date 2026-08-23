import { create } from 'zustand';

type Action = { label: string; onPress: () => void; shake?: boolean }; // shake: the device can trigger it too

// One-line transient status ("Saved", "Let go · Undo"). Anything calls show(); the root layout renders it.
export const useToast = create<{ message: string | null; action: Action | null; show(message: string, ms?: number, action?: Action): void; hide(): void }>((set) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    message: null,
    action: null,
    show(message, ms = 2000, action = undefined) {
      clearTimeout(timer);
      set({ message, action: action ?? null });
      timer = setTimeout(() => set({ message: null, action: null }), action ? Math.max(ms, 5000) : ms);
    },
    hide: () => { clearTimeout(timer); set({ message: null, action: null }); },
  };
});
