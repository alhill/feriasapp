import type { DocumentData, DocumentReference, Timestamp } from 'firebase/firestore';

export type SaleItem = {
  id: string;
  price: number;
  qty: number;
  ref: DocumentReference<DocumentData, DocumentData>;
  name: string | null;
};

export type Sale = {
  id: string;
  completed: boolean;
  createdAt: Timestamp;
  items: SaleItem[];
  paymentMethod: string;
  total: number;
};

type FirestoreSaleItemDoc = {
  id: unknown;
  price: unknown;
  qty: unknown;
  ref: unknown;
  name: unknown;
};

type FirestoreSaleDoc = {
  completed: unknown;
  createdAt: unknown;
  items: unknown;
  paymentMethod: unknown;
  total: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTimestamp(value: unknown): value is Timestamp {
  return (
    isObject(value) &&
    typeof (value as { seconds?: unknown }).seconds === 'number' &&
    typeof (value as { nanoseconds?: unknown }).nanoseconds === 'number'
  );
}

function isDocumentReference(value: unknown): value is DocumentReference<DocumentData, DocumentData> {
  return (
    isObject(value) &&
    typeof (value as { id?: unknown }).id === 'string' &&
    typeof (value as { path?: unknown }).path === 'string'
  );
}

function parseSaleItem(saleId: string, index: number, value: unknown): SaleItem {
  if (!isObject(value)) {
    throw new Error(`Venta invalida (${saleId}): "items[${index}]" debe ser un objeto.`);
  }

  const item = value as FirestoreSaleItemDoc;

  if (typeof item.id !== 'string' || item.id.trim().length === 0) {
    throw new Error(`Venta invalida (${saleId}): "items[${index}].id" debe ser string no vacio.`);
  }

  const price = item.price;
  if (typeof price !== 'number' || Number.isNaN(price)) {
    throw new Error(`Venta invalida (${saleId}): "items[${index}].price" debe ser number.`);
  }

  const qty = item.qty;
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty <= 0) {
    throw new Error(`Venta invalida (${saleId}): "items[${index}].qty" debe ser integer mayor que 0.`);
  }

  const ref = item.ref;
  if (!isDocumentReference(ref)) {
    throw new Error(`Venta invalida (${saleId}): "items[${index}].ref" debe ser una referencia de Firestore.`);
  }

  const name = item.name;
  if (name !== null && typeof name !== 'string') {
    throw new Error(`Venta invalida (${saleId}): "items[${index}].name" debe ser string o null.`);
  }

  return {
    id: item.id,
    price,
    qty,
    ref,
    name,
  };
}

export function parseSaleFromFirestore(id: string, data: unknown): Sale {
  if (!isObject(data)) {
    throw new Error(`Venta invalida (${id}): el documento no es un objeto.`);
  }

  const doc = data as FirestoreSaleDoc;

  if (typeof doc.completed !== 'boolean') {
    throw new Error(`Venta invalida (${id}): "completed" debe ser boolean.`);
  }

  if (!isTimestamp(doc.createdAt)) {
    throw new Error(`Venta invalida (${id}): "createdAt" debe ser timestamp de Firestore.`);
  }

  if (!Array.isArray(doc.items)) {
    throw new Error(`Venta invalida (${id}): "items" debe ser array.`);
  }

  if (typeof doc.paymentMethod !== 'string' || doc.paymentMethod.trim().length === 0) {
    throw new Error(`Venta invalida (${id}): "paymentMethod" debe ser string no vacio.`);
  }

  if (typeof doc.total !== 'number' || Number.isNaN(doc.total)) {
    throw new Error(`Venta invalida (${id}): "total" debe ser number.`);
  }

  const items = doc.items.map((value, index) => parseSaleItem(id, index, value));

  return {
    id,
    completed: doc.completed,
    createdAt: doc.createdAt,
    items,
    paymentMethod: doc.paymentMethod,
    total: doc.total,
  };
}

export function getSalesCollectionPath(eventId: string): string {
  return `events/${eventId}/sales`;
}
