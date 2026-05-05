export type Product = {
  id: string;
  name: string;
  price: number;
  category?: string;
  tags: string[];
  active: boolean;
};

type FirestoreProductDoc = {
  name: unknown;
  price: unknown;
  category?: unknown;
  tags?: unknown;
  active: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseProductFromFirestore(id: string, data: unknown): Product {
  if (!isObject(data)) {
    throw new Error(`Producto invalido (${id}): el documento no es un objeto.`);
  }

  const doc = data as FirestoreProductDoc;

  if (typeof doc.name !== 'string' || doc.name.trim().length === 0) {
    throw new Error(`Producto invalido (${id}): "name" debe ser string no vacio.`);
  }

  if (typeof doc.price !== 'number' || Number.isNaN(doc.price)) {
    throw new Error(`Producto invalido (${id}): "price" debe ser number.`);
  }

  if (typeof doc.active !== 'boolean') {
    throw new Error(`Producto invalido (${id}): "active" debe ser boolean.`);
  }

  if (doc.category !== undefined && doc.category !== null && typeof doc.category !== 'string') {
    throw new Error(`Producto invalido (${id}): "category" debe ser string si existe.`);
  }

  if (doc.tags !== undefined && !Array.isArray(doc.tags)) {
    throw new Error(`Producto invalido (${id}): "tags" debe ser string[] si existe.`);
  }

  const parsedTags = Array.isArray(doc.tags)
    ? doc.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    : [];

  return {
    id,
    name: doc.name,
    price: doc.price,
    active: doc.active,
    category: doc.category === null ? undefined : (doc.category as string | undefined),
    tags: parsedTags,
  };
}
