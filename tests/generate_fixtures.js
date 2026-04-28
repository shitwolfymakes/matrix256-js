#!/usr/bin/env node
// Tier-1 conformance runner for matrix256v1 (JavaScript implementation).
//
// Constructs each synthetic fixture from the matrix256 spec repo's
// CONFORMANCE_FIXTURES.md in a fresh temporary directory, runs the
// `matrix256.v1.fingerprint` reference implementation against it, and verifies
// the result matches the expected digest published in the spec repo's
// conformance_fixtures.json companion.
//
// Two roles in one script:
//
//   1. Conformance test harness. With expected digests loaded from the spec
//      repo, every fixture is executed and its produced digest compared to
//      the canonical value. A divergence is a regression in either this
//      implementation or the spec.
//
//   2. Canonical fixture generator. With --generate, the script constructs
//      each fixture and emits the JSON block ready to paste into the spec
//      repo's conformance_fixtures.json. Implementers in other languages
//      should treat the construction code in this file (and its Python
//      sibling) as the canonical reference where the markdown's prose is
//      ambiguous.
//
// Stdlib only — Node.js built-ins, no external packages.
//
// Usage:
//   node tests/generate_fixtures.js
//   node tests/generate_fixtures.js --fixture 14
//   node tests/generate_fixtures.js --range 1-10
//   node tests/generate_fixtures.js --generate
//
// By default the script reads conformance_fixtures.json from a sibling
// checkout of the spec repo at ../matrix256/ relative to this repo's root.
// Override with --fixtures PATH.

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  readdirSync,
  openSync,
  closeSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import process from 'node:process';

import * as v1 from '../src/v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const DEFAULT_FIXTURES_JSON = path.resolve(
  REPO_ROOT,
  '..',
  'matrix256',
  'conformance_fixtures.json',
);

class SkipFixture extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'SkipFixture';
  }
}

// --- Builders -------------------------------------------------------------
//
// Each builder receives a fresh empty directory and constructs the fixture
// state in it. Throwing SkipFixture means the platform can't host the fixture
// as written and the runner reports a skip rather than a fail.

function nfc(s) { return s.normalize('NFC'); }
function nfd(s) { return s.normalize('NFD'); }

function trySymlink(target, where) {
  try {
    symlinkSync(target, where);
  } catch (e) {
    throw new SkipFixture(`symlinks not supported (${e.code || e.message})`);
  }
}

function _b1_empty_dir(_d) { /* nothing */ }

function _b2_zero_byte_file(d) {
  writeFileSync(path.join(d, 'a'), '');
}

function _b3_small_ascii_file(d) {
  writeFileSync(path.join(d, 'hello.txt'), 'hello\n');
}

function _b4_two_files(d) {
  writeFileSync(path.join(d, 'a'), '');
  writeFileSync(path.join(d, 'b'), '');
}

function _b5_case_sensitive_sort(d) {
  writeFileSync(path.join(d, 'A'), '');
  try {
    writeFileSync(path.join(d, 'a'), '');
  } catch (e) {
    throw new SkipFixture(`filesystem is case-insensitive (${e.code || e.message})`);
  }
  const names = new Set(readdirSync(d));
  if (!(names.has('A') && names.has('a') && names.size === 2)) {
    throw new SkipFixture("filesystem collapsed 'A' and 'a' (case-insensitive)");
  }
}

function _b6_slash_vs_dash(d) {
  writeFileSync(path.join(d, 'a-b'), '');
  mkdirSync(path.join(d, 'a'));
  writeFileSync(path.join(d, 'a', 'b'), '');
}

function _b7_nested_dirs(d) {
  const nested = path.join(d, 'dir1', 'dir2');
  mkdirSync(nested, { recursive: true });
  writeFileSync(path.join(nested, 'file.txt'), '');
}

function _b8_sibling_full_path_sort(d) {
  mkdirSync(path.join(d, 'a'));
  writeFileSync(path.join(d, 'a', 'z'), '');
  mkdirSync(path.join(d, 'b'));
  writeFileSync(path.join(d, 'b', 'a'), '');
}

function _b9_only_empty_subdir(d) {
  mkdirSync(path.join(d, 'empty'));
}

function _b10_file_plus_empty_subdir(d) {
  writeFileSync(path.join(d, 'hello.txt'), 'hello\n');
  mkdirSync(path.join(d, 'empty'));
}

function _b11_only_symlink(d) {
  trySymlink('nonexistent', path.join(d, 'link'));
}

function _b12_symlink_alongside_file(d) {
  writeFileSync(path.join(d, 'real.txt'), 'x');
  trySymlink('real.txt', path.join(d, 'link'));
}

function _b13_latin_diacritics_nfc(d) {
  writeFileSync(path.join(d, nfc('café.txt')), '');
}

function _b14_latin_diacritics_nfd(d) {
  const nfdName = nfd('café.txt');
  writeFileSync(path.join(d, nfdName), '');
  // List with default (utf-8) decoding; if the FS auto-NFC'd we'll see the
  // composed form back instead of the decomposed form we wrote.
  const listed = readdirSync(d)[0];
  if (listed !== nfdName) {
    throw new SkipFixture('filesystem auto-normalized the filename at write time');
  }
}

function _b15_cyrillic(d) {
  writeFileSync(path.join(d, 'привет.txt'), '');
}

function _b16_han(d) {
  writeFileSync(path.join(d, '你好.txt'), '');
}

function _b17_arabic(d) {
  writeFileSync(path.join(d, 'مرحبا.txt'), '');
}

function _b18_emoji(d) {
  writeFileSync(path.join(d, '🎵.txt'), '');
}

function _b19_multi_script(d) {
  for (const name of ['ascii.txt', nfc('café.txt'), '你好.txt', '🎵.txt']) {
    writeFileSync(path.join(d, name), '');
  }
}

function _b20_size_boundaries(d) {
  const sizes = [
    ['size_0000000', 0],
    ['size_0000001', 1],
    ['size_0000255', 255],
    ['size_0000256', 256],
    ['size_0065535', 65535],
    ['size_0065536', 65536],
    ['size_1000000', 1000000],
  ];
  for (const [name, size] of sizes) {
    writeFileSync(path.join(d, name), Buffer.alloc(size));
  }
}

function _b21_many_small_files(d) {
  for (let i = 0; i < 100; i++) {
    const name = `f${String(i).padStart(3, '0')}`;
    writeFileSync(path.join(d, name), '');
  }
}

function _b22_deeply_nested(d) {
  let nested = d;
  for (const letter of 'abcdefghij') {
    nested = path.join(nested, letter);
  }
  mkdirSync(nested, { recursive: true });
  writeFileSync(path.join(nested, 'file.txt'), '');
}

function _b23_long_filename(d) {
  const name = 'a'.repeat(200);
  try {
    writeFileSync(path.join(d, name), '');
  } catch (e) {
    throw new SkipFixture(`filesystem rejected 200-byte component (${e.code || e.message})`);
  }
}

function _b24_surrogate_escape(d) {
  if (process.platform !== 'linux') {
    throw new SkipFixture(`non-UTF-8 filenames unsupported on ${process.platform}`);
  }
  // Build the path as raw bytes so the invalid 0xff byte survives intact.
  const dirBuf = Buffer.from(d, 'utf-8');
  const rawName = Buffer.from([0x62, 0x61, 0x64, 0xff, 0x2e, 0x74, 0x78, 0x74]); // 'bad\xff.txt'
  const fullPath = Buffer.concat([dirBuf, Buffer.from('/'), rawName]);
  let fd;
  try {
    fd = openSync(fullPath, 'wx', 0o644);
  } catch (e) {
    throw new SkipFixture(`could not create non-UTF-8 filename (${e.code || e.message})`);
  }
  closeSync(fd);
}

function _b25_prefix_sort(d) {
  for (const name of ['foo', 'foo.txt', 'foobar']) {
    writeFileSync(path.join(d, name), '');
  }
}

function _b26_content_irrelevance(d) {
  writeFileSync(path.join(d, 'hello.txt'), 'world!');
}

const FIXTURES = [
  { id: 1,  name: 'empty directory',                            builder: _b1_empty_dir,              requirements: [] },
  { id: 2,  name: 'single zero-byte file',                      builder: _b2_zero_byte_file,         requirements: [] },
  { id: 3,  name: 'single small ASCII file',                    builder: _b3_small_ascii_file,       requirements: [] },
  { id: 4,  name: 'two files at root',                          builder: _b4_two_files,              requirements: [] },
  { id: 5,  name: 'case-sensitive sort',                        builder: _b5_case_sensitive_sort,    requirements: ['case_sensitive_fs'] },
  { id: 6,  name: 'slash vs dash sort edge case',               builder: _b6_slash_vs_dash,          requirements: [] },
  { id: 7,  name: 'nested directories',                         builder: _b7_nested_dirs,            requirements: [] },
  { id: 8,  name: 'sibling directories sort by full path',      builder: _b8_sibling_full_path_sort, requirements: [] },
  { id: 9,  name: 'only an empty subdirectory',                 builder: _b9_only_empty_subdir,      requirements: [] },
  { id: 10, name: 'file plus an empty subdirectory',            builder: _b10_file_plus_empty_subdir,requirements: [] },
  { id: 11, name: 'only a symlink',                             builder: _b11_only_symlink,          requirements: ['symlinks'] },
  { id: 12, name: 'symlink alongside a file',                   builder: _b12_symlink_alongside_file,requirements: ['symlinks'] },
  { id: 13, name: 'Latin diacritics, NFC source',               builder: _b13_latin_diacritics_nfc,  requirements: [] },
  { id: 14, name: 'Latin diacritics, NFD source',               builder: _b14_latin_diacritics_nfd,  requirements: ['byte_preserving_fs'] },
  { id: 15, name: 'Cyrillic filename',                          builder: _b15_cyrillic,              requirements: [] },
  { id: 16, name: 'Han filename',                               builder: _b16_han,                   requirements: [] },
  { id: 17, name: 'Arabic filename',                            builder: _b17_arabic,                requirements: [] },
  { id: 18, name: 'emoji filename',                             builder: _b18_emoji,                 requirements: [] },
  { id: 19, name: 'multi-script directory',                     builder: _b19_multi_script,          requirements: [] },
  { id: 20, name: 'size boundaries',                            builder: _b20_size_boundaries,       requirements: [] },
  { id: 21, name: 'many small files',                           builder: _b21_many_small_files,      requirements: [] },
  { id: 22, name: 'deeply nested file',                         builder: _b22_deeply_nested,         requirements: [] },
  { id: 23, name: 'long filename',                              builder: _b23_long_filename,         requirements: ['long_component_names'] },
  { id: 24, name: 'surrogate-escape filename byte',             builder: _b24_surrogate_escape,      requirements: ['non_utf8_filenames'] },
  { id: 25, name: 'prefix and trailing-character sort',         builder: _b25_prefix_sort,           requirements: [] },
  { id: 26, name: 'content irrelevance (bit-rot tolerance)',    builder: _b26_content_irrelevance,   requirements: [] },
];

// --- Runner ---------------------------------------------------------------

function loadExpected(fixturesPath) {
  const raw = readFileSync(fixturesPath, 'utf-8');
  const parsed = JSON.parse(raw);
  const map = new Map();
  for (const f of parsed.fixtures) {
    map.set(f.id, f.expected_digest);
  }
  return map;
}

function runOne(fix) {
  const tmp = mkdtempSync(path.join(tmpdir(), `m256_fix${String(fix.id).padStart(2, '0')}_`));
  try {
    try {
      fix.builder(tmp);
    } catch (e) {
      if (e instanceof SkipFixture) return ['skip', e.message];
      throw e;
    }
    return ['digest', v1.fingerprint(tmp)];
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const args = { fixture: null, range: null, fixtures: DEFAULT_FIXTURES_JSON, generate: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fixture') {
      args.fixture = parseInt(argv[++i], 10);
      if (Number.isNaN(args.fixture)) throw new Error('--fixture requires an integer');
    } else if (a === '--range') {
      args.range = argv[++i];
    } else if (a === '--fixtures') {
      args.fixtures = path.resolve(argv[++i]);
    } else if (a === '--generate') {
      args.generate = true;
    } else if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${a}`);
    }
  }
  if (args.fixture !== null && args.range !== null) {
    throw new Error('--fixture and --range are mutually exclusive');
  }
  return args;
}

function printHelp() {
  process.stdout.write(
    `matrix256v1 Tier-1 synthetic-fixture conformance runner.\n\n` +
    `Usage:\n` +
    `  node tests/generate_fixtures.js [options]\n\n` +
    `Options:\n` +
    `  --fixture N         run only the fixture with this id\n` +
    `  --range A-B         run fixtures in this inclusive id range\n` +
    `  --fixtures PATH     path to conformance_fixtures.json\n` +
    `                      (default: ${DEFAULT_FIXTURES_JSON})\n` +
    `  --generate          construct fixtures and emit a JSON block of computed\n` +
    `                      digests instead of verifying against the spec repo\n` +
    `  -h, --help          show this message\n`,
  );
}

function selectFixtures(args) {
  if (args.fixture !== null) {
    const m = FIXTURES.filter(f => f.id === args.fixture);
    if (m.length === 0) throw new Error(`no fixture with id ${args.fixture}`);
    return m;
  }
  if (args.range !== null) {
    const parts = args.range.split('-');
    if (parts.length !== 2) throw new Error(`--range must be in the form A-B (got ${JSON.stringify(args.range)})`);
    const lo = parseInt(parts[0], 10);
    const hi = parseInt(parts[1], 10);
    if (Number.isNaN(lo) || Number.isNaN(hi)) {
      throw new Error(`--range must be in the form A-B (got ${JSON.stringify(args.range)})`);
    }
    if (lo > hi) throw new Error(`--range bounds reversed: ${lo} > ${hi}`);
    return FIXTURES.filter(f => f.id >= lo && f.id <= hi);
  }
  return FIXTURES.slice();
}

function emitGenerateBlock(generated) {
  return JSON.stringify(
    {
      version: 'matrix256v1',
      fixture_doc: 'CONFORMANCE_FIXTURES.md',
      fixtures: generated,
    },
    null,
    2,
  );
}

function pad2(n) { return String(n).padStart(2, '0'); }

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    return 2;
  }

  const selected = selectFixtures(args);

  let expected = null;
  if (!args.generate) {
    if (!existsSync(args.fixtures)) {
      process.stderr.write(
        `error: ${args.fixtures} not found. Pass --fixtures PATH or clone ` +
        `the spec repo as a sibling at ../matrix256/.\n`,
      );
      return 2;
    }
    expected = loadExpected(args.fixtures);
  }

  let fail = 0;
  let skip = 0;
  let passed = 0;
  const generated = [];

  for (const fix of selected) {
    const [status, value] = runOne(fix);
    if (status === 'skip') {
      skip += 1;
      console.log(`[ skip ] fixture ${pad2(fix.id)} — ${fix.name}: ${value}`);
      continue;
    }
    const produced = value;
    if (args.generate) {
      generated.push({
        id: fix.id,
        name: fix.name,
        expected_digest: produced,
        platform_requirements: fix.requirements.slice(),
      });
      console.log(`[ gen  ] fixture ${pad2(fix.id)} — ${fix.name}: ${produced}`);
      continue;
    }
    const exp = expected.get(fix.id);
    if (exp === undefined) {
      fail += 1;
      console.log(
        `[ FAIL ] fixture ${pad2(fix.id)} — ${fix.name}: no expected digest in ${args.fixtures}`,
      );
      continue;
    }
    if (produced === exp) {
      passed += 1;
      console.log(`[ pass ] fixture ${pad2(fix.id)} — ${fix.name}: ${produced}`);
    } else {
      fail += 1;
      console.log(`[ FAIL ] fixture ${pad2(fix.id)} — ${fix.name}`);
      console.log(`         produced: ${produced}`);
      console.log(`         expected: ${exp}`);
    }
  }

  if (args.generate) {
    console.log();
    console.log('--- conformance_fixtures.json (paste into the matrix256 spec repo) ---');
    console.log(emitGenerateBlock(generated));
    console.log(`\nsummary: ${generated.length} generated, ${skip} skipped`);
    return 0;
  }

  const total = passed + fail + skip;
  console.log(`\nsummary: ${passed} pass, ${fail} fail, ${skip} skip (${total} total)`);
  return fail ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
