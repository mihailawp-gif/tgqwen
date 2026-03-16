import { create } from 'zustand';

interface UserState {
  balance: number;
  name: string;
  avatarUrl: string;
  openings: number;
  referrals: number;
  deposits: number;
  freeTimerInterval: number | null;
  freeSyncInterval: number | null;
  freeRemainingSeconds: number;
  setBalance: (amount: number) => void;
  setUser: (user: Partial<UserState>) => void;
}

interface AppState {
  activeScreen: string; // 'main-screen', 'opening-screen', 'crash-screen', etc.
  activeTab: 'main' | 'cases' | 'inventory' | 'profile';
  loaderVisible: boolean;
  toast: { message: string, visible: boolean } | null;
  desktopGuardVisible: boolean;
  topUpOpen: boolean;
  setActiveScreen: (screen: string) => void;
  setActiveTab: (tab: 'main' | 'cases' | 'inventory' | 'profile') => void;
  setLoaderVisible: (v: boolean) => void;
  showToast: (message: string) => void;
  setDesktopGuardVisible: (visible: boolean) => void;
  setTopUpOpen: (open: boolean) => void;
}

export const useUserStore = create<UserState>((set) => ({
  balance: 0,
  name: 'Загрузка...',
  avatarUrl: '',
  openings: 0,
  referrals: 0,
  deposits: 0,
  freeTimerInterval: null,
  freeSyncInterval: null,
  freeRemainingSeconds: 0,
  setBalance: (balance) => set({ balance }),
  setUser: (userToUpdate) => set((state) => ({ ...state, ...userToUpdate })),
}));

export const useAppStore = create<AppState>((set) => ({
  activeScreen: 'main-screen',
  activeTab: 'main',
  loaderVisible: false,
  toast: null,
  desktopGuardVisible: true,
  topUpOpen: false,
  setActiveScreen: (activeScreen) => set({ activeScreen }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setLoaderVisible: (loaderVisible) => set({ loaderVisible }),
  showToast: (message) => {
    set({ toast: { message, visible: true } });
    setTimeout(() => {
      set({ toast: null });
    }, 3000);
  },
  setDesktopGuardVisible: (desktopGuardVisible) => set({ desktopGuardVisible }),
  setTopUpOpen: (topUpOpen) => set({ topUpOpen }),
}));
