---
applyTo: "**/*.ts"
---

# Offline Sync

The app is designed to work in environments with unreliable connectivity.

---

# Local Persistence

- Active sale event and product catalogue are persisted locally on app load
- Use Zustand with a persistence middleware (e.g. AsyncStorage or MMKV)
- Persisted slices: `activeEvent`, `products`
- Cart state is NOT persisted — it resets on app restart

---

# Offline Sale Queue

- Sales created while offline are stored in a local queue
- Each queued sale has a client-generated immutable `id` (UUID)
- Each queued sale has `status: "local"`
- On connectivity restore, the queue is flushed to Firestore
- After a successful write, set `status: "synced"` and `syncedAt`
- On write failure, set `status: "failed"` and retry on next sync attempt
- Never delete a local sale record — only update its status

---

# Multi-User Safety

- Assume many users can create offline sales at the same time on different devices
- Sync is append-only: only create missing sales documents
- Never run destructive sync operations (`delete`, `replace`, or collection overwrite)
- Do not recompute or rewrite existing remote sales during sync
- Use deterministic path per sale: `/events/{eventId}/sales/{saleId}`
- Use idempotent writes with `setDoc(docRef, sale, { merge: false })` for new sale IDs
- If the target `saleId` already exists remotely, treat as already synced and continue
- Conflict policy: local and remote sales are cumulative; do not overwrite either side

---

# Sync Strategy

- Check connectivity on app foreground and on network change events
- Flush pending queue automatically when online
- Provide a manual "Sync now" action visible when there are unsynced sales
- Show unsynced count in the UI

---

# Firebase / Firestore Usage

- Use Firestore onSnapshot for products and active event when online
- Prefer `setDoc` with client-generated sale IDs for confirmed sales
- Keep Firestore rules restrictive — authenticated users only
- Firebase Functions are used only if server-side logic is needed (e.g. aggregations)