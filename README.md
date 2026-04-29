# Crux

Base mobile app with Expo + Expo Router, Firebase, NativeWind, Zustand persistence, React Hook Form, and Firebase Functions as the server-side AI + R2 layer.

## Stack prepared

- Expo Router for app routing (`src/app`)
- NativeWind + Tailwind for reusable UI primitives
- Zustand + AsyncStorage for persisted session/cache state
- Firebase client SDK for Auth, Firestore, and callable Functions
- Firebase Functions (TypeScript) for OpenAI processing
- Cloudflare R2 private signed upload/read flow from Functions

## Prerequisites

- Bun (recommended in this repo)
- Firebase CLI (`npm i -g firebase-tools`)

## Local setup

1. Install app dependencies

```bash
bun install
```

2. Create app env file

```bash
cp .env.example .env
```

3. Install Functions dependencies

```bash
npm run functions:install
```

4. Create Functions env file

```bash
cp functions/.env.example functions/.env
```

5. Set Firebase project

- Update `.firebaserc` with your Firebase project id.

## Run

### Expo app

```bash
bun run start
```

### Functions (local emulator)

```bash
cd functions && npm run build
firebase emulators:start
```

## Useful scripts

- `bun run typecheck`: TypeScript check in app
- `bun run lint`: Expo lint
- `bun run functions:build`: Build Firebase Functions

## Project structure (new base)

- `src/lib/firebase/*`: Firebase app/auth/firestore/functions clients
- `src/stores/*`: Zustand persisted stores
- `src/lib/r2/upload.ts`: callable + signed upload/read client helpers
- `src/components/forms/*`: reusable React Hook Form components
- `functions/src/index.ts`: event AI pipeline + R2 signed URL callables
