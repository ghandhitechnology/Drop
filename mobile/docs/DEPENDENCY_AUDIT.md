# Dependency audit

Last reviewed: 2026-08-23 for Expo SDK 57 (`expo@57.0.15`) and React Native 0.86.2.

## Applied compatible remediations

- Root: updated the transitive `nanoid` used by the Vitest/Vite/PostCSS toolchain from 3.3.17 to
  3.3.18. `npm audit` now reports zero root vulnerabilities.
- Mobile: updated the same transitive `nanoid` package from 3.3.17 to 3.3.18.
- Mobile: pinned `metro`, `metro-config`, and `metro-transform-worker` to 0.84.5 with npm
  overrides. React Native 0.86.2 requests `^0.84.3`, and Expo's SDK 57 toolchain already uses
  0.84.5. This removes the vulnerable `image-size@1.2.1` path and resolves the four high-severity
  Metro findings without changing Expo or React Native.

## Remaining mobile advisory

`npm audit` reports 11 moderate findings, all graph effects of one transitive advisory:
[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) in `uuid@7.0.3`.

Representative installed paths:

- `drop-mobile > expo-splash-screen@57.0.7 > @expo/config-plugins@57.0.8 > xcode@3.0.1 > uuid@7.0.3`
- `drop-mobile > expo@57.0.15 > @expo/cli@57.0.17 > @expo/config-plugins@57.0.8 > xcode@3.0.1 > uuid@7.0.3`
- `drop-mobile > expo@57.0.15 > @expo/config@57.0.8 > @expo/config-plugins@57.0.8 > xcode@3.0.1 > uuid@7.0.3`
- `drop-mobile > expo@57.0.15 > @expo/cli@57.0.17 > @expo/inline-modules@0.1.6 > @expo/config-plugins@57.0.8 > xcode@3.0.1 > uuid@7.0.3`
- `drop-mobile > expo@57.0.15 > @expo/cli@57.0.17 > @expo/prebuild-config@57.0.13 > @expo/config-plugins@57.0.8 > xcode@3.0.1 > uuid@7.0.3`

There is no compatible remediation in the current SDK. `xcode@3.0.1`, its latest release, requires
`uuid@^7.0.3`; the advisory is fixed only in `uuid@11.1.1` or newer. Overriding that transitive
dependency would cross four major versions outside `xcode`'s declared range. npm's forced remedy
instead proposes downgrading Expo or `expo-splash-screen`, which would break the SDK 57 dependency
set and React Native compatibility. Keep this advisory open until Expo's config-plugin chain adopts
a patched `xcode`/`uuid` combination, then remove it with a normal SDK-compatible update.
