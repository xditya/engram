import { create } from 'zustand';

// One-line transient status ("Saved", "Synced"). Screens render it; anything can show it.
export const useToast = create<{ message: string | null; show(message: string, ms?: number): void; hide(): void }>((set) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    message: null,
    show(message, ms = 2000) {
      clearTimeout(timer);
      set({ message });
      timer = setTimeout(() => set({ message: null }), ms);
    },
    hide: () => { clearTimeout(timer); set({ message: null }); },
  };
});
