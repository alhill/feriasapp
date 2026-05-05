import { collection, getDocs, orderBy, query, type QueryDocumentSnapshot } from 'firebase/firestore';

import { db } from '@/lib/firebase/firestore';
import { type CachedSale, useCacheStore } from '@/stores/cache-store';

type FirestoreTimestampLike = {
  toDate: () => Date;
};

type RawSaleItem = {
  id?: unknown;
  name?: unknown;
  qty?: unknown;
  quantity?: unknown;
  price?: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toDate(value: unknown): Date | null {
  if (isObject(value) && typeof (value as FirestoreTimestampLike).toDate === 'function') {
    return (value as FirestoreTimestampLike).toDate();
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function parseSale(snapshot: QueryDocumentSnapshot): CachedSale | null {
  const data = snapshot.data();

  const total = data.total;
  if (typeof total !== 'number' || Number.isNaN(total)) {
    return null;
  }

  const createdAtDate = toDate(data.createdAt);
  if (!createdAtDate) {
    return null;
  }

  const rawItems = Array.isArray(data.items) ? data.items : [];

  const items = rawItems
    .map((rawItem) => {
      if (!isObject(rawItem)) {
        return null;
      }

      const typedItem = rawItem as RawSaleItem;
      const id = typeof typedItem.id === 'string' && typedItem.id.trim().length > 0 ? typedItem.id : null;
      const price = typeof typedItem.price === 'number' && !Number.isNaN(typedItem.price) ? typedItem.price : null;
      const qtyValue =
        typeof typedItem.qty === 'number'
          ? typedItem.qty
          : (typeof typedItem.quantity === 'number' ? typedItem.quantity : null);

      if (!id || price === null || qtyValue === null || !Number.isInteger(qtyValue) || qtyValue <= 0) {
        return null;
      }

      const name = typedItem.name;

      return {
        id,
        name: typeof name === 'string' ? name : null,
        qty: qtyValue,
        price,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    id: snapshot.id,
    createdAtIso: createdAtDate.toISOString(),
    total,
    items,
  };
}

export async function syncSalesForEventFromFirestore(eventId: string): Promise<{ sales: CachedSale[]; syncedAt: string }> {
  const salesQuery = query(collection(db, 'events', eventId, 'sales'), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(salesQuery);

  const sales = snapshot.docs
    .map((docSnapshot) => parseSale(docSnapshot))
    .filter((sale): sale is CachedSale => sale !== null)
    .sort((a, b) => Date.parse(b.createdAtIso) - Date.parse(a.createdAtIso));

  useCacheStore.getState().setSalesForEvent(eventId, sales);

  return {
    sales,
    syncedAt: new Date().toISOString(),
  };
}
