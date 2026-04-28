# matrix256-js

JavaScript reference implementation of [**matrix256v1**](https://github.com/shitwolfymakes/matrix256) — a SHA-256 fingerprint over the (path, size) records of a rooted filesystem tree.

**Private repository.** Not published to npm. The `package.json` carries `"private": true`; the GitHub remote (when added) must be configured private as well.

## Dependencies

Zero runtime dependencies — pure JavaScript on the Node.js standard library:

- `node:crypto` — SHA-256 (`createHash('sha256')`)
- `node:fs` — directory walk, file metadata
- `node:buffer` — byte handling for non-UTF-8 filenames
- `TextEncoder` / `TextDecoder` — UTF-8 with U+FFFD substitution per spec §2.2
- `String.prototype.normalize('NFC')` — Unicode normalization per spec §2.2

Dev dependencies are scoped to linting (`eslint` + `eslint-plugin-jsdoc`) and enforce the [library discipline](#library-discipline) below. They live in `package.json` under `devDependencies`; consumers running `npm install matrix256-js` never see them. The JavaScript ecosystem is treated as a supply-chain risk; no third-party runtime packages may be added without explicit justification. Type information is provided via JSDoc comments rather than TypeScript so that no build step (and therefore no `typescript` toolchain dependency) is required.

Node.js 18 or newer.

## Library discipline

The library promise is: **a consumer's process must never break because of code in this package.** The rules below are enforced by `eslint` (CI runs `npm run lint` on every push); a few rows are intent rules that still require code review.

| Category | What's guarded | Enforced by |
|---|---|---|
| Code-injection safety | No `eval(...)`, no `new Function(...)`. Code is written at author time, never constructed at run time from data. | `no-eval`, `no-implied-eval`, `no-new-func` |
| Throw discipline | No `process.exit(...)` from library code; no `node:assert` in library paths. Failures throw typed `Error` instances with messages, never bare strings, so callers can `instanceof`-check and re-throw. | `no-throw-literal` and `no-restricted-syntax` selectors for `process.exit` and `node:assert` imports |
| Equality | `===` / `!==` only — no `==` / `!=`. No reliance on implicit `ToNumber` / `ToString` coercion of caller-supplied values. | `eqeqeq` |
| Bounds checking | Out-of-bounds array/buffer access in JS returns `undefined` rather than throwing, which usually defers a confusing failure to a later call site. Length checks before indexing. | code review |
| Output discipline | No `console.log` / `console.error` / `console.warn` from library code. A fingerprint call has no business producing output. | `no-console` |
| Side effects at import | No top-level work beyond imports and constants. The single host-platform read (`process.platform` for the host separator byte in [`src/v1.js`](src/v1.js)) is the only environment touch at module load. | code review |
| Documentation | Every public function carries a JSDoc block with `@param` and `@returns`. Public API stays self-describing without a TypeScript build step. | `jsdoc/require-jsdoc` (publicOnly), `jsdoc/require-param`, `jsdoc/require-returns` |

Tests under [`tests/`](tests/) are exempt via a matching `files` block in [`eslint.config.js`](eslint.config.js) — they use `console.*` and `node:assert` freely, as Node's test idiom expects.

```
npm install     # install eslint + plugin into node_modules
npm run lint    # run the discipline checks
```

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
