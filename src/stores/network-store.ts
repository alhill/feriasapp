import AsyncStorage from '@react-native-async-storage/async-storage';
import { disableNetwork, enableNetwork } from 'firebase/firestore';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { db } from '@/lib/firebase/firestore';

type NetworkState = {
  isOfflineMode: boolean;
  setOfflineMode: (offline: boolean) => Promise<void>;
  applyPersistedMode: () => Promise<void>;
};

export const useNetworkStore = create<NetworkState>()(
  persist(
    (set, get) => ({
      isOfflineMode: false,
      setOfflineMode: async (offline) => {
        set({ isOfflineMode: offline });
        try {
          if (offline) {
            await disableNetwork(db);
          } else {
            await enableNetwork(db);
          }
        } catch {
          // Firestore may not be initialized yet; state is still saved.
        }
      },
      // Call this once on app startup after hydration to restore Firestore network state.
      applyPersistedMode: async () => {
        const { isOfflineMode } = get();
        try {
          if (isOfflineMode) {
            await disableNetwork(db);
          }
        } catch {
          // Ignore if Firestore not ready.
        }
      },
    }),
    {
      name: 'feriantes-app-network-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
