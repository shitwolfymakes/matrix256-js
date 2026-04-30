// Copyright 2026 wolfy <wolfy@shitwolfymakes.com>
// SPDX-License-Identifier: Apache-2.0

// matrix256 — reproducible fingerprints for optical discs and filesystem trees.
//
// The active algorithm version lives in `./v1.js`: a SHA-256 over a canonical
// serialization of the (path, size) records of every regular file under the
// walk root. See SPEC.md in the spec repo for the normative specification:
// https://github.com/shitwolfymakes/matrix256/blob/main/SPEC.md
//
// Importing code addresses the algorithm explicitly:
//
//     import * as v1 from 'matrix256-js/v1';
//     const digest = v1.fingerprint(mountpoint);
//
// The package exposes nothing at the top level so future versions can be
// added as sibling submodules (`./v2.js`, …) without a "current" default
// that would silently change behavior.
