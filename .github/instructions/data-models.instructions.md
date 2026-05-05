---
applyTo: "**/*.ts"
---

# Data Models

## SaleEvent (sale context / session)

Represents a sales session such as a festival day or market stand.

```ts
{
  id: string
  name: string
  date: string          // ISO date
  active: boolean
  createdAt: string
}
```

## Product

```ts
{
  id: string
  name: string
  price: number         // in cents or base currency unit
  category?: string
  active: boolean
}
```

## Sale

An immutable record of a completed transaction.

```ts
{
  id: string
  saleEventId: string
  deviceId: string
  cashierId?: string
  items: SaleItem[]
  total: number
  createdAt: string
  syncedAt?: string     // set when written to Firestore
  status: "local" | "synced" | "failed"
}

type SaleItem = {
  productId: string
  name: string          // snapshot at time of sale
  price: number         // snapshot at time of sale
  quantity: number
}
```

---

# Rules

- Sales are immutable after creation — never edit a confirmed sale
- Product name and price are snapshotted into each SaleItem at time of sale
- Do not reference products by ID only inside a sale — snapshot the relevant fields
- Offline sales use status `"local"` and are synced later
- `syncedAt` is set only after successful Firestore write
- `id` is generated on client at sale creation time and never changes
- Sync must be idempotent by `id` (same sale must not be duplicated)