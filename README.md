# engram

Local-first, end-to-end-encrypted, bring-your-own-model "remember everything, organize nothing" app.
Every device holds a full SQLite replica; sync is an encrypted op-log on a blob store you own.
React Native (Expo, expo-router) on iOS and Android; core logic is pure TypeScript.

## Install / run / test

```sh
pnpm install
pnpm typecheck                       # all packages
pnpm test                            # core tests (vitest on better-sqlite3, FTS5)
```

## Running the app

engram needs a **development build** -- Expo Go cannot run it (op-sqlite, executorch, the OCR module and share-intent are native).

**Android**: Android Studio / SDK (platform 36, build-tools, an emulator or a USB-debugging device), JDK 17+, `ANDROID_HOME` set. Then:

```sh
pnpm android                         # prebuilds android/, builds the dev client, installs it, starts Metro
pnpm start                           # later runs: just Metro, the installed dev client reconnects
```

**iOS**: a Mac with Xcode, then `pnpm ios`. No Mac: `cd apps/mobile && eas build -p ios --profile development` (see `apps/mobile/eas.json`; `preview` / `production` profiles are there too).

## Packages

| Path | Package | What |
|---|---|---|
| `packages/core` | `@engram/core` | Pure TS: `Platform` interface, schema + migrations, model/storage/AI/extract/sync types. No RN/DOM/Node imports. |
| `packages/db-rn` | `@engram/db-rn` | React Native implementations: op-sqlite `Database`, secure `KeyStore`, `FileStore`, iCloud `StorageAdapter`. |
| `apps/mobile` | `mobile` | Expo app: routes in `app/`, theme + icons + UI primitives in `src/`, Platform assembly in `src/lib/engram.ts`. |

`packages/core/src/model/schema.sql` is the source of truth; `pnpm --filter @engram/core gen:schema` regenerates `schema.ts`.
