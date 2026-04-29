import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type ModuleCacheState = {
  moduleCache: Record<string, Record<string, unknown>>;
  setModuleCache: (moduleId: string, data: Record<string, unknown>) => void;
  clearModuleCache: (moduleId: string) => void;
  clearAllCache: () => void;
};

export const useCacheStore = create<ModuleCacheState>()(
  persist(
    (set) => ({
      moduleCache: {},
      setModuleCache: (moduleId, data) =>
        set((state) => ({
          moduleCache: {
            ...state.moduleCache,
            [moduleId]: data,
          },
        })),
      clearModuleCache: (moduleId) =>
        set((state) => {
          const nextCache = { ...state.moduleCache };
          delete nextCache[moduleId];
          return { moduleCache: nextCache };
        }),
      clearAllCache: () => set({ moduleCache: {} }),
    }),
    {
      name: 'crux-module-cache-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
