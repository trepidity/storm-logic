# Severe-desk contract fixtures

This directory holds immutable, public-safe provider payloads that close the
fixture half of `T-SD-00`. It contains no provider adapters or production code.

Each source has a directory named by the source id in `manifest.json`. Every
artifact must have a manifest entry with a redacted request, UTC capture time,
HTTP status and content type, SHA-256, case classification, and the exact
contract properties it proves. Live records are public provider responses;
malformed and upstream-failure cases are clearly marked constructed inputs.

Run `node scripts/severe-desk-fixture-check.mjs` to see the missing closure
evidence. A passing command is required before a source adapter is written.
