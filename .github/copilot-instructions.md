# Project Overview

Mobile sales registry app built with:
- Expo + Expo Router
- Firebase (Firestore)
- Zustand
- NativeWind
- React Hook Form

This is a point-of-sale (POS) app for registering sales at events (e.g. festivals, fairs).

---

# Core Domain

- **Sale event**: a context that groups sales (e.g. "Ventas Festival 2026"). One active at a time.
- **Product**: an item that can be sold. Stored in Firestore, cached locally.
- **Sale**: a transaction recording which products were sold, quantities, totals, and the associated sale event.
- A sale is created by selecting products into a cart and confirming the transaction.

---

# Core Architecture

- Firestore is the source of truth
- Zustand is used for UI state and local cache (active event, products, cart)
- The cart is ephemeral UI state — it is never persisted to Firestore directly
- A confirmed sale is written to Firestore as an immutable record
- Clients listen to Firestore updates with onSnapshot where real-time sync matters
- Sync is append-only and idempotent across devices; never use destructive merges or overwrites

---

# Offline Support

- The app must work offline for use in low/no-connectivity environments
- Products and the active sale event must be persisted locally (async storage or MMKV)
- Sales created offline are queued and synced to Firestore when connectivity is restored
- The UI must clearly indicate offline/online status
- Conflict resolution: offline sales are appended, never overwrite server data

---

# Key Principles

- Keep code simple and pragmatic
- Avoid overengineering
- Prefer reusable functions, utilities and components
- Prefer flat data structures
- Use async/await
- Avoid `any`

---

# State Management

- Zustand manages: current session (active event), product cache, cart state, sync queue
- Firestore is the source of truth for products, events, and sales history
- Do not derive totals or business logic on the server — keep it simple on the client

---

# Future Integrations

- SumUp card payment integration is planned post-MVP
- Design payment flow to be pluggable (abstract the payment step)

---

# What to Avoid

- SQL or relational patterns
- Tight coupling between modules
- Mixing UI and data logic
- Blocking the user during network operations

---

# Agent Search Safety

- Do not run `rg` (ripgrep) in terminal commands for this repository.
- Use these alternatives for search tasks:
	- `grep_search` for text search
	- `file_search` for glob/path matching
	- `semantic_search` for intent-based code discovery
	- `Explore` subagent for broad codebase exploration
- If terminal search is required, use non-rg commands that do not freeze the editor.