import AsyncStorage from '@react-native-async-storage/async-storage';
import { Timestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { db } from '@/lib/firebase/firestore';
import { useNetworkStore } from '@/stores/network-store';

type PendingSaleStatus = 'local' | 'failed';

export type FirestoreTimestampValue = {
  seconds: number;
  nanoseconds: number;
};

export type PendingSaleItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
};

export type PendingSale = {
  id: string;
  saleEventId: string;
  saleEventName?: string;
  deviceId: string;
  cashierId: string | null;
  items: PendingSaleItem[];
  total: number;
  createdAt: FirestoreTimestampValue;
  status: PendingSaleStatus;
  lastError: string | null;
};

type LegacyPendingSaleItem = {
  id?: string;
  productId?: string;
  name: string;
  price: number;
  qty?: number;
  quantity?: number;
};

type LegacyPendingSale = Omit<PendingSale, 'items' | 'createdAt'> & {
  items: Array<PendingSaleItem | LegacyPendingSaleItem>;
  createdAt: FirestoreTimestampValue | string;
};

type CreatePendingSaleInput = {
  saleEventId: string;
  saleEventName?: string;
  deviceId: string;
  cashierId: string | null;
  items: PendingSaleItem[];
  total: number;
};

type SyncResult = {
  ok: boolean;
  message: string | null;
};

type SyncOptions = {
  ignoreOfflineMode?: boolean;
};

type SalesQueueState = {
  pendingSales: PendingSale[];
  isSyncing: boolean;
  enqueueSale: (input: CreatePendingSaleInput) => PendingSale;
  deletePendingSale: (saleId: string) => void;
  clearPendingSales: () => void;
  syncPendingSale: (saleId: string, options?: SyncOptions) => Promise<SyncResult>;
  syncAllPendingSales: (options?: SyncOptions) => Promise<{ synced: number; failed: number }>;
};

function createPendingSaleId(): string {
  return `sale_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function mapErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'No se pudo sincronizar la venta.';
}

function toTimestampValue(timestamp: Timestamp): FirestoreTimestampValue {
  return {
    seconds: timestamp.seconds,
    nanoseconds: timestamp.nanoseconds,
  };
}

function toFirestoreTimestamp(timestampValue: FirestoreTimestampValue): Timestamp {
  return new Timestamp(timestampValue.seconds, timestampValue.nanoseconds);
}

function normalizePendingSale(rawSale: LegacyPendingSale): PendingSale {
  let normalizedCreatedAt: FirestoreTimestampValue;
  if (typeof rawSale.createdAt === 'string') {
    const parsedDate = new Date(rawSale.createdAt);
    normalizedCreatedAt = Number.isNaN(parsedDate.getTime())
      ? toTimestampValue(Timestamp.now())
      : toTimestampValue(Timestamp.fromDate(parsedDate));
  } else {
    normalizedCreatedAt = rawSale.createdAt;
  }

  const normalizedItems = rawSale.items.map((item) => {
    if ('id' in item && typeof item.id === 'string' && 'qty' in item && typeof item.qty === 'number') {
      return {
        id: item.id,
        name: item.name,
        price: item.price,
        qty: item.qty,
      };
    }

    const legacyItem = item as LegacyPendingSaleItem;
    const itemId =
      typeof legacyItem.id === 'string'
        ? legacyItem.id
        : (legacyItem.productId ?? 'unknown-product');
    const itemQty =
      typeof legacyItem.qty === 'number'
        ? legacyItem.qty
        : (legacyItem.quantity ?? 0);

    return {
      id: itemId,
      name: item.name,
      price: item.price,
      qty: itemQty,
    };
  });

  return {
    ...rawSale,
    createdAt: normalizedCreatedAt,
    items: normalizedItems,
  };
}

async function writeSaleToFirestore(sale: PendingSale): Promise<void> {
  const saleRef = doc(db, 'events', sale.saleEventId, 'sales', sale.id);
  const existingDoc = await getDoc(saleRef);

  if (existingDoc.exists()) {
    return;
  }

  await setDoc(
    saleRef,
    {
      saleEventId: sale.saleEventId,
      deviceId: sale.deviceId,
      cashierId: sale.cashierId,
      items: sale.items.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        qty: item.qty,
        ref: doc(db, 'products', item.id),
      })),
      total: sale.total,
      createdAt: toFirestoreTimestamp(sale.createdAt),
      syncedAt: new Date().toISOString(),
      status: 'synced',
    },
    { merge: false }
  );
}

export const useSalesQueueStore = create<SalesQueueState>()(
  persist(
    (set, get) => ({
      pendingSales: [],
      isSyncing: false,
      enqueueSale: (input) => {
        const sale: PendingSale = {
          id: createPendingSaleId(),
          saleEventId: input.saleEventId,
          saleEventName: input.saleEventName,
          deviceId: input.deviceId,
          cashierId: input.cashierId,
          items: input.items,
          total: input.total,
          createdAt: toTimestampValue(Timestamp.now()),
          status: 'local',
          lastError: null,
        };

        set((state) => ({ pendingSales: [...state.pendingSales, sale] }));
        return sale;
      },
      deletePendingSale: (saleId) => {
        set((state) => ({
          pendingSales: state.pendingSales.filter((sale) => sale.id !== saleId),
        }));
      },
      clearPendingSales: () => set({ pendingSales: [] }),
      syncPendingSale: async (saleId, options) => {
        const targetSale = get().pendingSales.find((sale) => sale.id === saleId);

        if (!targetSale) {
          return { ok: true, message: null };
        }

        const isOfflineMode = useNetworkStore.getState().isOfflineMode;
        const shouldIgnoreOfflineMode = options?.ignoreOfflineMode === true;
        if (isOfflineMode && !shouldIgnoreOfflineMode) {
          return { ok: false, message: 'Modo sin conexion activo.' };
        }

        try {
          await writeSaleToFirestore(targetSale);
          set((state) => ({
            pendingSales: state.pendingSales.filter((sale) => sale.id !== saleId),
          }));
          return { ok: true, message: null };
        } catch (error) {
          const message = mapErrorMessage(error);
          set((state) => ({
            pendingSales: state.pendingSales.map((sale) => {
              if (sale.id !== saleId) {
                return sale;
              }

              return {
                ...sale,
                status: 'failed',
                lastError: message,
              };
            }),
          }));
          return { ok: false, message };
        }
      },
      syncAllPendingSales: async (options) => {
        const isOfflineMode = useNetworkStore.getState().isOfflineMode;
        const shouldIgnoreOfflineMode = options?.ignoreOfflineMode === true;
        if (isOfflineMode && !shouldIgnoreOfflineMode) {
          return { synced: 0, failed: get().pendingSales.length };
        }

        set({ isSyncing: true });
        try {
          const pendingIds = get().pendingSales.map((sale) => sale.id);
          let synced = 0;
          let failed = 0;

          for (const saleId of pendingIds) {
            const result = await get().syncPendingSale(saleId, options);
            if (result.ok) {
              synced += 1;
            } else {
              failed += 1;
            }
          }

          return { synced, failed };
        } finally {
          set({ isSyncing: false });
        }
      },
    }),
    {
      name: 'feriantes-app-sales-queue-store',
      storage: createJSONStorage(() => AsyncStorage),
      merge: (persistedState, currentState) => {
        const typedPersistedState = persistedState as Partial<SalesQueueState> | undefined;

        if (!typedPersistedState?.pendingSales) {
          return {
            ...currentState,
            ...typedPersistedState,
          };
        }

        return {
          ...currentState,
          ...typedPersistedState,
          pendingSales: typedPersistedState.pendingSales.map((sale) => normalizePendingSale(sale as LegacyPendingSale)),
        };
      },
    }
  )
);
