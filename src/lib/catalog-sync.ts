import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';

import { db } from '@/lib/firebase/firestore';
import { parseConfigFromFirestore } from '@/models/app-config';
import { parseProductFromFirestore, type Product } from '@/models/product';
import { type CachedEvent, useCacheStore } from '@/stores/cache-store';

const CATALOG_SYNC_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type FirestoreTimestampLike = {
  toDate: () => Date;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toText(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return fallback;
}

function toDateLabel(value: unknown): string {
  if (isObject(value) && typeof (value as FirestoreTimestampLike).toDate === 'function') {
    return (value as FirestoreTimestampLike).toDate().toLocaleDateString('es-ES');
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('es-ES');
    }
  }

  return '(sin fecha)';
}

export function shouldAutoSyncCatalog(lastCatalogSyncAt: string | null, maxAgeMs: number = CATALOG_SYNC_MAX_AGE_MS): boolean {
  if (!lastCatalogSyncAt) {
    return true;
  }

  const lastSyncMs = Date.parse(lastCatalogSyncAt);
  if (Number.isNaN(lastSyncMs)) {
    return true;
  }

  return Date.now() - lastSyncMs >= maxAgeMs;
}

export async function syncCatalogFromFirestore(): Promise<{ products: Product[]; tags: string[]; events: CachedEvent[]; syncedAt: string }> {
  const [productsSnapshot, configSnapshot, eventsSnapshot] = await Promise.all([
    getDocs(collection(db, 'products')),
    getDoc(doc(db, 'config', '1')),
    getDocs(query(collection(db, 'events'), orderBy('date', 'desc'))),
  ]);

  if (!configSnapshot.exists()) {
    throw new Error('No existe el documento /config/1.');
  }

  const products = productsSnapshot.docs
    .map((docSnapshot) => parseProductFromFirestore(docSnapshot.id, docSnapshot.data()))
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  const config = parseConfigFromFirestore(configSnapshot.id, configSnapshot.data());
  const tags = [...config.tags].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

  const events = eventsSnapshot.docs.map((docSnapshot) => {
    const data = docSnapshot.data();
    const objectData = isObject(data) ? data : {};

    return {
      id: docSnapshot.id,
      name: toText(objectData.name, '(sin nombre)'),
      dateLabel: toDateLabel(objectData.date),
    };
  });

  const syncedAt = new Date().toISOString();

  useCacheStore.getState().setCatalogData({
    products,
    events,
    tags,
    syncedAt,
  });

  return {
    products,
    tags,
    events,
    syncedAt,
  };
}
