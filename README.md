# Drop

Drop is a personal water-footprint tracker. You photograph a meal or a product, the app recognizes
what is in the frame, matches each item against a curated catalog, and returns a water-footprint
estimate you can adjust and confirm into your own history. The grounding principle runs through the
whole system: the LLM only identifies items, and every litre comes from versioned factor tables
built from published datasets. Estimates work offline — the tables ship inside the app bundle, and
the API is a refresh path rather than a prerequisite.

## Repo layout

```
backend/               Hono API (@drop/backend): /v1/recognize, /v1/barcode, /v1/research,
                       /v1/usage*, /v1/catalog, /v1/factors, /v1/estimate, /v1/search, /v1/health
mobile/                Expo / React Native app (expo-router, Skia hand-drawn UI, SQLite history)
packages/water-engine/ shared estimation engine (@drop/water-engine), used by backend and mobile
packages/factors/data/ versioned factor tables (2026.08.2 current, 2026.08.1 regression fixture)
pipeline/              Python extractors that build the factor tables from the raw datasets
water_logic/           raw source datasets (~150MB) — pipeline input only, never read at runtime
docs/                  Plan.md pitch, FNDDS and LCA Commons dataset evaluations
assets/character/      sliced hippo avatar poses + manifest.json used by the app
Basic_character_assets.png   the source sprite sheet; pipeline/src/drop_pipeline/slice_character.py
                             slices it into assets/character/
```

`mobile/` is not an npm workspace — it has its own `package.json` and lockfile, and pulls the engine
in as a `file:` dependency.

## Getting started

Prerequisites: Node 22+ and npm (developed on Node 26 / npm 11). Python 3.11 is only needed if you
rebuild the factor tables; the app and API never touch the pipeline.

```sh
npm install                 # root workspaces: backend + packages/*
cd mobile && npm install    # mobile has its own lockfile
```

### Backend

```sh
cp .env.example .env
```

Set `OPENROUTER_API_KEY` — photo recognition calls `openai/gpt-5.6-luna` through OpenRouter.
`DATABASE_URL` is optional: without it the daily usage limits fall back to an in-memory store, which
is fine locally and resets on restart. `USAGE_ENFORCEMENT` and `USAGE_LEGACY_POLICY` control limit
enforcement. `HOST` and `PORT` (default `8787`) pin the listener, and `RECOGNIZE_PIPELINE=mono`
rolls recognition back from the default detect → ground → rerank split to the single-call pipeline.

```sh
npm run dev --workspace=@drop/backend       # tsx watch on :8787
npm run migrate --workspace=@drop/backend   # usage migrations, needs DATABASE_URL
```

### Mobile

```sh
cd mobile
npm run dev      # expo start
npm run ios      # expo run:ios
npm run android  # expo run:android
```

The app resolves the API from `expo.extra.apiBaseUrl` in `mobile/app.json`, which points at the
deployed Railway service. Clear it to talk to a local backend: the client then reuses the Metro
bundle's host on port 8787, so a phone on the same LAN finds your machine without typing an IP.

## Testing

```sh
npm test                                  # root: backend + water-engine (vitest)
npm run typecheck --workspaces --if-present

cd mobile
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run lint       # expo lint
```

## Data pipeline

The tables under `packages/factors/data/<version>/` are generated, not hand-edited. The extractors
in `pipeline/src/drop_pipeline/` read the raw datasets in `water_logic/datasets/` (SU-EATABLE,
FNDDS, HESTIA, OWID, USLCI, USEEIO), hard-assert row counts and spot values, and fail on any
unjoined name — joins get fixed in `pipeline/config/*.yaml`, never by loosening normalization. Run
order, dataset roles, and the reasoning behind each source live in
[`pipeline/README.md`](pipeline/README.md).

A rebuild emits a new version directory. Both sides pin it explicitly: `FACTORS_VERSION` in
`backend/src/data.ts`, and in the mobile app from the bundled `mobile/src/data/seed/manifest.json`.
Bumping a version means updating the backend constant and re-copying the seed tables.

Mobile refreshes newer releases through a staged, all-or-nothing activation path. It checks the
manifest compatibility fields plus every runtime file's exact byte hash, byte count, row count, and
engine schema before storing or activating anything; startup revalidates the active release and
falls back to the bundled tables on any failure. The integrity model and the explicit unsigned-
manifest limitation are documented in [`docs/FACTOR_REFRESH.md`](docs/FACTOR_REFRESH.md).

## Dev screens

Three routes exist for development only and have no in-app entry point — reach them by deep link
(`drop://kitchen-sink`, or `exp://<metro-host>/--/kitchen-sink` in Expo Go). `/kitchen-sink` is the
design-token and motion sandbox, `/avatar-lab` renders every hippo pose, and `/data-lab` is a
harness for the water engine.

## Deployment

The backend deploys to Railway from the repo root — `railway.toml` defines the build and start
command (migrations run before the listener opens), and `.railwayignore` keeps the datasets and
mobile app out of the upload. The mobile app ships through EAS: OTA changes go out with
`eas-cli update`, native changes need a new build and submit. Project IDs, health-check URLs, and
the full release sequence are in [`mobile/docs/PRODUCTION.md`](mobile/docs/PRODUCTION.md).

## Docs

- [`PRODUCT.md`](PRODUCT.md) — the living product spec.
- [`docs/Plan.md`](docs/Plan.md) — the original pitch.
- [`docs/FNDDS_EVALUATION.md`](docs/FNDDS_EVALUATION.md) and
  [`docs/LCA_COMMONS_EVALUATION.md`](docs/LCA_COMMONS_EVALUATION.md) — why each dataset was kept,
  narrowed, or refused.
