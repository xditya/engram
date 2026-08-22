import { create } from 'zustand';

// One-time, non-blocking tip the Library shows right after the first onboarding save. Module state is enough:
// onboarding runs once per install, and a restart before the Library renders simply drops the tip.
export const useShareTip = create<{ visible: boolean; show(): void; dismiss(): void }>((set) => ({
  visible: false,
  show: () => set({ visible: true }),
  dismiss: () => set({ visible: false }),
}));
export const SHARE_TIP = 'From any app: Share → engram.';
