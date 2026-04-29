---
applyTo: "**/*.ts"
---

This app uses an event-based architecture.

Each user interaction is stored as an event.

Event structure:

{
  id: string,
  timestamp: string,
  type: "user_note" | "user_deep" | "system_generated",
  source: "text" | "voice" | "photo",
  user_input: string,
  media?: [],
  modules_active: string[],
  structured_data: Record<string, any>,
  related_events?: string[],
  status?: "pending" | "processing" | "processed" | "failed" | "archived"
}

Rules:

- Events are immutable after creation
- Do not overwrite events → create new ones instead
- structured_data must be namespaced per module:
  {
    mood: {...},
    exercise: {...},
    food: {...}
  }

- Design code to support **re-processing events** if module definitions change
- Clients should only read events; **never process messages locally**