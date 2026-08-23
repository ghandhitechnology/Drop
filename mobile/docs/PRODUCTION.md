# Production Operations

Drop uses two production systems: Railway for the backend API and EAS Update for the mobile application.

## Release verification

The GitHub Actions **Release verification** workflow must pass for the exact
commit being released. It uses clean installs and runs these same gates without
deployment credentials:

```bash
# Engine and backend (repository root)
npm ci
npm test
npm run typecheck --workspaces --if-present

# Mobile (separate lockfile)
cd mobile
npm ci
npm test
npm run typecheck
npm run lint
npm run check-contrast
npm run doctor
cd ..

# Factor pipeline (Python 3.11, exact pins in pipeline/requirements.txt)
python3.11 -m venv pipeline/.venv
pipeline/.venv/bin/pip install -r pipeline/requirements.txt
pipeline/.venv/bin/pytest pipeline/tests -q
```

The backend suite includes golden estimate parity. The pipeline suite includes
byte-for-byte parity between the generated runtime factor tables and the mobile
seed. A release must not bypass either check. Lint and Expo Doctor are also hard
gates; fix or stack the release commit on the relevant prerequisite fixes when
the base branch is known to fail them.

## Backend production

The backend runs on Railway:

- API: <https://drop-backend-production-375a.up.railway.app>
- Health check: <https://drop-backend-production-375a.up.railway.app/v1/health>

The mobile app reads this URL from `expo.extra.apiBaseUrl` in `mobile/app.json`.

Backend deployments take effect immediately. Users do not need to update or restart the mobile app unless the API contract changes alongside mobile code.

### Deploy the backend

From the repository root:

```bash
set -a
source .env
set +a

npx @railway/cli up \
  --project d231d90a-05c8-41c6-9e43-1660f72eedbc \
  --environment production \
  --service drop-backend
```

Verify the deployment:

```bash
EXPECTED_USAGE_LEGACY_POLICY=allow
curl -fsS https://drop-backend-production-375a.up.railway.app/v1/health \
  | jq -e --arg policy "$EXPECTED_USAGE_LEGACY_POLICY" '
      .ok == true and
      .factors_version == "2026.08.2" and
      .catalog_version == .factors_version and
      .model == "openai/gpt-5.6-luna" and
      .usage_store == "ready" and
      .usage_enforcement == "on" and
      .usage_legacy_policy == $policy
    '
```

Set `EXPECTED_USAGE_LEGACY_POLICY` to the policy required for the rollout
phase (`allow` during the compatibility window, then `reject`). `jq -e` exits
non-zero if the response is missing a required field or carries an unexpected
value; seeing HTTP 200 alone is not release verification.

### Daily camera usage storage

The per-installation daily camera allowance requires a Railway Postgres
service. Link its private connection string into `drop-backend` as
`DATABASE_URL`, then set:

```text
USAGE_ENFORCEMENT=on
USAGE_LEGACY_POLICY=allow
```

The backend start script applies the versioned usage migrations under a
Postgres advisory lock before opening the HTTP listener. A production health
response must report `usage_store: "ready"` before the new mobile build is
released.

The compatibility rollout is intentionally staged:

1. Deploy the backend with `USAGE_LEGACY_POLICY=allow`.
2. Release the native mobile build containing Secure Store and Crypto.
3. Leave compatibility enabled for seven days while watching the structured
   `[usage] legacy analysis allowed` log.
4. Set `USAGE_LEGACY_POLICY=reject`; old builds then receive HTTP 426.

`USAGE_ENFORCEMENT=off` is the incident-only kill switch. It serves a virtual
zero-usage snapshot and lets analysis proceed without Postgres; restore it to
`on` after the incident is resolved.

The installation's reported IANA timezone defines its local day and follows
legitimate travel. This best-effort, installation-level model deliberately
trusts that value; deliberate timezone manipulation requires device attestation
and is outside the current threat model.

## Mobile production updates

The EAS project is [`@heemangstudios/drop`](https://expo.dev/accounts/heemangstudios/projects/drop).

Production configuration:

- Channel: `production`
- Branch: `production`
- Runtime version: derived from the app version
- Current runtime: `1.0.0`
- Update URL: `https://u.expo.dev/6fc6a34f-493b-49c4-979b-82d04c10a438`

The app checks for updates when it launches. With the current zero-second launch wait, it starts immediately and downloads a new update in the background. The downloaded update is applied on the next cold launch.

### Publish an update

Use EAS Update for TypeScript, JavaScript, UI, styling, copy, application logic, and bundled assets.

Publish iOS and Android separately because the web export currently fails on the `expo-sqlite` WASM dependency:

```bash
cd mobile
set -a
source ../.env
set +a

CI=1 npx eas-cli update \
  --channel production \
  --environment production \
  --platform ios \
  --message "Describe the change" \
  --non-interactive

CI=1 npx eas-cli update \
  --channel production \
  --environment production \
  --platform android \
  --message "Describe the change" \
  --non-interactive
```

Before publishing, confirm the full release-verification workflow above passed
for the commit being published. Do not substitute an earlier commit's result.

## When a new binary is required

Create a new native build for changes involving:

- Native packages
- Camera or system permissions
- Expo SDK or React Native upgrades
- iOS or Android native configuration
- A new app/runtime version

The daily usage feature adds `expo-secure-store` and `expo-crypto`, so its first
release requires new iOS and Android binaries rather than an OTA-only update.

The runtime policy follows the app version. Changing `mobile/app.json` from `1.0.0` to `1.1.0` creates runtime `1.1.0`. Distribute a `1.1.0` binary before publishing updates for that runtime.

### Build production binaries

```bash
cd mobile

npx eas-cli build --profile production --platform ios
npx eas-cli build --profile production --platform android
```

Submit the completed builds through EAS Submit:

```bash
npx eas-cli submit --profile production --platform ios
npx eas-cli submit --profile production --platform android
```

Store-installed production builds receive compatible updates from the `production` channel.

## Rollback

Use the EAS dashboard to select a previous production update, or inspect available rollback commands with:

```bash
cd mobile
npx eas-cli update:rollback --help
```

A rollback must target the same runtime version as the installed binary.
