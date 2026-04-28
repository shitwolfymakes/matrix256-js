// matrix256v1 — reference JavaScript implementation of the filesystem-walk
// fingerprint. Every regular file under the walk root contributes one
// (relative-path, size) record to a SHA-256 hash. The walk and serialization
// logic here must stay in lockstep with the normative spec in SPEC.md
// (https://github.com/shitwolfymakes/matrix256/blob/main/SPEC.md). If one
// changes, the other must too.

import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { Buffer } from 'node:buffer';

export const VERSION = '1';

// Path component separator on the host filesystem, as a single byte. The
// relative path emitted into the digest is always joined with U+002F ('/'),
// regardless of host (spec §2.2); this constant is only used to construct the
// host paths we hand back to readdir/stat.
const HOST_SEP_BYTE = process.platform === 'win32' ? 0x5c : 0x2f;
const REL_SEP_BYTE = 0x2f;

// TextDecoder with default fatal=false replaces every invalid UTF-8 sequence
// with U+FFFD, exactly matching the substitution rule in spec §2.2.
const decoder = new TextDecoder('utf-8');
const encoder = new TextEncoder();

/**
 * @typedef {object} Entry
 * @property {Buffer} hostPath  Absolute host path of the file (Buffer to
 *   survive non-UTF-8 names). Not part of the digest.
 * @property {Uint8Array} relative  UTF-8 encoded, NFC-normalized, root-relative
 *   path with '/' separators. This is the byte sequence that goes into the
 *   hash input.
 * @property {bigint} size  File size in bytes per filesystem metadata.
 */

function bufferConcatWithSep(parts, sepByte) {
  if (parts.length === 0) return Buffer.alloc(0);
  let total = parts.length - 1;
  for (const p of parts) total += p.length;
  const out = Buffer.allocUnsafe(total);
  let off = 0;
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) out[off++] = sepByte;
    parts[i].copy(out, off);
    off += parts[i].length;
  }
  return out;
}

// Take an array of raw filesystem name buffers (one per descent step) and
// produce the canonical UTF-8 byte sequence used for hashing: components
// joined with '/', UTF-8-decoded with U+FFFD substitution for invalid bytes,
// NFC-normalized, then UTF-8 re-encoded. The decode→NFC→encode pipeline
// matches the Python reference's NFC-then-encode flow on byte-preserving
// filesystems and yields identical bytes for filenames containing lone
// surrogates / surrogate-escape bytes.
function canonicalRelative(componentBuffers) {
  const joined = bufferConcatWithSep(componentBuffers, REL_SEP_BYTE);
  const str = decoder.decode(joined);
  const nfc = str.normalize('NFC');
  return encoder.encode(nfc);
}

function* scan(rootBuf, currentBuf, ancestors) {
  const dirents = readdirSync(currentBuf, {
    withFileTypes: true,
    encoding: 'buffer',
  });
  for (const de of dirents) {
    if (de.isSymbolicLink()) continue;
    const childBuf = bufferConcatWithSep([currentBuf, de.name], HOST_SEP_BYTE);
    const components = ancestors.concat([de.name]);
    if (de.isDirectory()) {
      yield* scan(rootBuf, childBuf, components);
      continue;
    }
    if (!de.isFile()) continue;
    const st = statSync(childBuf, { bigint: true });
    yield {
      hostPath: childBuf,
      relative: canonicalRelative(components),
      size: st.size,
    };
  }
}

function compareBytes(a, b) {
  return Buffer.compare(a, b);
}

/**
 * Collect every regular file under `root`, sorted by UTF-8 path bytes.
 *
 * Directories are skipped (their existence is implied by the relative paths
 * of contained files), as are symbolic links (not followed, not emitted) and
 * other non-file entries (devices, sockets, FIFOs). Throws on any metadata
 * failure — matrix256v1 is all-or-nothing per spec §3.
 *
 * @param {string | Buffer | URL} root
 * @returns {Entry[]}
 */
export function walk(root) {
  const rootBuf = Buffer.isBuffer(root)
    ? root
    : Buffer.from(typeof root === 'string' ? root : root.pathname);
  const entries = Array.from(scan(rootBuf, rootBuf, []));
  entries.sort((a, b) => compareBytes(a.relative, b.relative));
  return entries;
}

/**
 * Compute the matrix256v1 digest of the filesystem rooted at `root`.
 *
 * Walks the tree, sorts entries by UTF-8 path bytes (spec §2.4), feeds the
 * per-entry serialization (`<path-bytes> 0x00 <size-ascii> 0x0A`, spec §2.5)
 * into SHA-256 (spec §2.6). Returns 64 lowercase hex digits. Throws if any
 * directory or file metadata can't be read.
 *
 * @param {string | Buffer | URL} root
 * @returns {string}
 */
export function fingerprint(root) {
  const hash = createHash('sha256');
  const NUL = Buffer.from([0x00]);
  const LF = Buffer.from([0x0a]);
  for (const e of walk(root)) {
    hash.update(e.relative);
    hash.update(NUL);
    hash.update(Buffer.from(e.size.toString(), 'ascii'));
    hash.update(LF);
  }
  return hash.digest('hex');
}
