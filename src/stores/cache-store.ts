import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Product } from '@/models/product';

export type CachedEvent = {
  id: string;
  name: string;
  dateLabel: string;
};

export type CachedSaleItem = {
  id: string;
  name: string | null;
  qty: number;
  price: number;
};

export type CachedSale = {
  id: string;
  createdAtIso: string;
  total: number;
  items: CachedSaleItem[];
};

type ModuleCacheState = {
  moduleCache: Record<string, Record<string, unknown>>;
  products: Product[];
  events: CachedEvent[];
  salesByEventId: Record<string, CachedSale[]>;
  availableTags: string[];
  lastCatalogSyncAt: string | null;
  setModuleCache: (moduleId: string, data: Record<string, unknown>) => void;
  clearModuleCache: (moduleId: string) => void;
  clearAllCache: () => void;
  setAvailableTags: (tags: string[]) => void;
  setCatalogData: (payload: { products: Product[]; events: CachedEvent[]; tags: string[]; syncedAt?: string }) => void;
  setSalesForEvent: (eventId: string, sales: CachedSale[]) => void;
  clearSalesForEvent: (eventId: string) => void;
  setLastCatalogSyncAt: (iso?: string) => void;
};

export const useCacheStore = create<ModuleCacheState>()(
  persist(
    (set) => ({
      moduleCache: {},
      products: [],
      events: [],
      salesByEventId: {},
      availableTags: [],
      lastCatalogSyncAt: null,
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
      clearAllCache: () => set({ moduleCache: {}, salesByEventId: {} }),
      setAvailableTags: (tags) => set({ availableTags: tags }),
      setCatalogData: ({ products, events, tags, syncedAt }) =>
        set({
          products,
          events,
          availableTags: tags,
          lastCatalogSyncAt: syncedAt ?? new Date().toISOString(),
        }),
      setSalesForEvent: (eventId, sales) =>
        set((state) => ({
          salesByEventId: {
            ...state.salesByEventId,
            [eventId]: sales,
          },
        })),
      clearSalesForEvent: (eventId) =>
        set((state) => {
          const nextSalesByEventId = { ...state.salesByEventId };
          delete nextSalesByEventId[eventId];
          return {
            salesByEventId: nextSalesByEventId,
          };
        }),
      setLastCatalogSyncAt: (iso) => set({ lastCatalogSyncAt: iso ?? new Date().toISOString() }),
    }),
    {
      name: 'feriantes-app-module-cache-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
