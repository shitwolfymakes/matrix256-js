# matrix256-js

JavaScript reference implementation of [**matrix256v1**](https://github.com/shitwolfymakes/matrix256) — a SHA-256 fingerprint over the (path, size) records of a rooted filesystem tree.

**Private repository.** Not published to npm. The `package.json` carries `"private": true`; the GitHub remote (when added) must be configured private as well.

## No dependencies

Zero runtime dependencies. Zero dev dependencies. Pure JavaScript on the Node.js standard library:

- `node:crypto` — SHA-256 (`createHash('sha256')`)
- `node:fs` — directory walk, file metadata
- `node:buffer` — byte handling for non-UTF-8 filenames
- `TextEncoder` / `TextDecoder` — UTF-8 with U+FFFD substitution per spec §2.2
- `String.prototype.normalize('NFC')` — Unicode normalization per spec §2.2

The JavaScript ecosystem is treated as a supply-chain risk; no third-party packages may be added without explicit justification. Type information is provided via JSDoc comments rather than TypeScript so that no build step (and therefore no `typescript` toolchain dependency) is required.

Node.js 18 or newer.

## Usage

```javascript
import * as v1 from 'matrix256-js/v1';

const digest = v1.fingerprint('/media/user/DISC');
```

The package exposes nothing at the top level. Future algorithm versions will be added as sibling submodules (`./v2.js`, …) so callers always address an explicit version.

## Conformance

This implementation's Tier-1 conformance test is the synthetic fixture suite at [`tests/generate_fixtures.js`](tests/generate_fixtures.js). The script constructs each fixture in a temporary directory, runs `v1.fingerprint` against it, and verifies the produced digest against the canonical value published in the spec repo's [`conformance_fixtures.json`](https://github.com/shitwolfymakes/matrix256/blob/main/conformance_fixtures.json) (human-readable companion: [`CONFORMANCE_FIXTURES.md`](https://github.com/shitwolfymakes/matrix256/blob/main/CONFORMANCE_FIXTURES.md)). The suite has no external data dependency and runs on every commit in CI.

```
node tests/generate_fixtures.js                      # run all fixtures
node tests/generate_fixtures.js --fixture 14         # one fixture
node tests/generate_fixtures.js --range 1-10         # a range
node tests/generate_fixtures.js --generate           # emit JSON for the spec repo
```

By default the runner expects the spec repo to be cloned alongside this one as `../matrix256/`. Override with `--fixtures PATH`. Platform-incompatible fixtures (e.g. case-sensitive sort on a case-insensitive filesystem, surrogate-escape paths off Linux) are reported as skips rather than failures.

The script mirrors the construction logic of the Python sibling [`matrix256-py/tests/generate_fixtures.py`](https://github.com/shitwolfymakes/matrix256-py/blob/main/tests/generate_fixtures.py); both languages must agree on every fixture's on-disk state and produced digest.

## See also (in the [spec repo](https://github.com/shitwolfymakes/matrix256))

- `SPEC.md` — normative algorithm
- `RATIONALE.md` — design rationale
- `IMPLEMENTERS.md` — practical guidance (encoding, mount handling, bridge discs)
- `CORPUS.md` — known-good digests across real discs
- `CONFORMANCE_FIXTURES.md` / `conformance_fixtures.json` — Tier-1 synthetic fixture suite
