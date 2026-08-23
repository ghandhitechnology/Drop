# Factor refresh safety

Every litre in Drop is calculated locally by `@drop/water-engine` from one
versioned release. The bundle is the permanent fallback; network data is never
required to estimate.

## Release contract

The pipeline emits a manifest with `release_format_version`,
`factor_schema_version`, and exact SHA-256, byte, and row metadata for the
catalogue and each runtime factor table. The API serves the generated UTF-8
JSON bytes verbatim. Mobile accepts only the format and factor schema it knows,
requires the full runtime file set, checks every byte hash and row count,
validates calculation-critical JSON shapes and unique identities, builds the
tables, and smoke-tests every catalogue entry through the engine.

Only then is the complete release inserted into SQLite in one transaction. A
second validation occurs immediately before activation. Activation changes one
durable active-version pointer transactionally and then swaps the one in-memory
`RawTables`/`Tables` pair synchronously. A process restart revalidates the
pointed-to release before restoring it. A missing, partial, corrupt, or newly
incompatible release clears the pointer and uses the bundled tables.

Each capture freezes its table set for the whole asynchronous run. Search picks
carry that release version, and barcode/recognition responses are accepted only
when their `catalog_version` matches it. An activation therefore applies to the
next capture and cannot splice a new table into one already in progress.

Confirmed history stores its original estimate and factor version. Activating a
new release does not recalculate past entries.

## Cryptographic limitation

The server contract does not currently provide a signed manifest or a pinned
release-signing public key. File hashes therefore detect corruption, partial or
cross-release responses, and accidental server/CDN inconsistency only while the
manifest is trusted (normally through HTTPS). A compromised origin could serve
a changed manifest and matching changed files. End-to-end publisher
authenticity requires a future signed-manifest contract and a public key pinned
in the app; the client does not claim that guarantee today.
