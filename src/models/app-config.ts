export type AppConfig = {
  tags: string[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseConfigFromFirestore(id: string, data: unknown): AppConfig {
  if (!isObject(data)) {
    throw new Error(`Config invalida (${id}): el documento no es un objeto.`);
  }

  const doc = data as AppConfig;

  if (!Array.isArray(doc.tags)) {
    throw new Error(`Config invalida (${id}): "tags" debe ser un array.`);
  }

  return {
    tags: doc.tags,
  };
}
