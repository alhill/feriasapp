---
applyTo: "**/*.ts"
---

AI processing follows a multi-step pipeline:

1. Module detection
2. Structured data extraction
3. Optional response generation

---

# Module Detection

- Input: raw user message
- Output: list of relevant modules
- Done entirely in Firebase Functions
- A message can match multiple modules
- Clients must not perform detection
- Do NOT assume a single category

---

# Structured Extraction

- Input: message + selected modules
- Output: structured JSON per module
- Each module extracts independently
- Namespaced output:
  {
    mood: {...},
    exercise: {...}
  }
- Functions must persist results in Firestore
- Clients update automatically via onSnapshot

---

# Modules System

Modules are dynamic and stored in Firestore.

Each module has:
- id
- description
- schema
- version
- active

Rules:

- Do not hardcode module logic
- Design systems to allow adding new modules easily
- Keep modules loosely coupled
- Function logic must reference modules and version for consistency
- Clients should only read module results, not process them


---

# Response Generation

- Only generate responses when needed
- Base responses on structured data, not only raw text
- Done in Functions, stored as `system_generated` events
- Clients receive them automatically via snapshot listeners

---

# Important Constraints

- Never merge module outputs incorrectly
- Never lose raw user input
- Avoid blocking the user for AI response
- Always preserve traceability between events