#!/usr/bin/env node
/**
 * scripts/copy-licenses.mjs
 *
 * Copies the canonical Apache 2.0 LICENSE and NOTICE files from the repository
 * root into every packages directory at build time.
 *
 * Why This Exists
 *
 * npm requires LICENSE and NOTICE files to be physically present inside each
 * published package directory. The path "../LICENSE" is unreachable from within
 * a package tarball. Maintaining 24 identical copies by hand is a devops
 * anti-pattern (drift, missed updates, review burden).
 *
 * This script is the canonical solution: one source of truth at the repo root,
 * automatically distributed to all packages during the build step.
 *
 * Usage
 *
 *   node scripts/copy-licenses.mjs
 *   (called via "pnpm copy-licenses" or as a dependency of "turbo run build")
 *
 * Behaviour
 *
 * - Reads ./LICENSE and ./NOTICE from the repository root.
 * - Discovers every direct child of packages/ that contains a package.json.
 * - Copies both files into each discovered package directory (idempotent).
 * - Logs a checkmark per package on success, an x on failure.
 * - Exits 1 if any error occurs — no silent partial success in CI.
 *
 * @see Implementation Plan — Track 1: Legal Compliance
 * @see agent/06-enterstellar-setup.md — Bootstrap sequence
 */

import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Resolve paths relative to this script file, not process.cwd().
// This guarantees correct resolution regardless of where the script is invoked.
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PACKAGES_DIR = join(ROOT, 'packages');
const SOURCE_LICENSE = join(ROOT, 'LICENSE');
const SOURCE_NOTICE = join(ROOT, 'NOTICE');

// ---------------------------------------------------------------------------
// Guard: validate source files exist before attempting any file system writes.
// A missing source file is a configuration error — fail immediately.
// ---------------------------------------------------------------------------
if (!existsSync(SOURCE_LICENSE)) {
  process.stderr.write(
    '[copy-licenses] ERROR: ./LICENSE not found at repository root.\n' +
      '  Ensure the canonical LICENSE file is committed before running this script.\n',
  );
  process.exit(1);
}

if (!existsSync(SOURCE_NOTICE)) {
  process.stderr.write(
    '[copy-licenses] ERROR: ./NOTICE not found at repository root.\n' +
      '  Ensure the canonical NOTICE file is committed before running this script.\n',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Discover all valid package directories.
// A valid package directory is a direct child of packages/ that:
//   (a) is a directory (not a file or symlink to a file), AND
//   (b) contains a package.json (identifies it as an npm package).
// This correctly skips .DS_Store entries, stray files, and uninitialized stubs.
// ---------------------------------------------------------------------------
let entries;
try {
  entries = readdirSync(PACKAGES_DIR);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write('[copy-licenses] ERROR: Cannot read packages/ directory: ' + message + '\n');
  process.exit(1);
}

const packageDirs = entries
  .map((name) => join(PACKAGES_DIR, name))
  .filter((dir) => {
    try {
      return statSync(dir).isDirectory() && existsSync(join(dir, 'package.json'));
    } catch {
      // Silently skip entries that cannot be stat'd (e.g., broken symlinks).
      return false;
    }
  });

if (packageDirs.length === 0) {
  process.stderr.write('[copy-licenses] ERROR: No valid packages found in packages/. Aborting.\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Copy LICENSE and NOTICE into each package directory.
// Errors are collected rather than thrown immediately so that all failures
// are reported in a single pass — easier to diagnose in CI logs.
// ---------------------------------------------------------------------------
let copied = 0;

/** @type {{ pkgName: string; message: string }[]} */
const errors = [];

for (const pkgDir of packageDirs) {
  // Extract the directory name as a human-readable package identifier for logs.
  const parts = pkgDir.split('/');
  const pkgName = parts[parts.length - 1] !== undefined ? parts[parts.length - 1] : pkgDir;

  try {
    copyFileSync(SOURCE_LICENSE, join(pkgDir, 'LICENSE'));
    copyFileSync(SOURCE_NOTICE, join(pkgDir, 'NOTICE'));
    process.stdout.write('[copy-licenses] OK  ' + pkgName + '\n');
    copied++;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push({ pkgName, message });
    process.stderr.write('[copy-licenses] ERR ' + pkgName + ': ' + message + '\n');
  }
}

// ---------------------------------------------------------------------------
// Final summary and exit code.
// ---------------------------------------------------------------------------
process.stdout.write(
  '\n[copy-licenses] Done — ' + copied + ' of ' + packageDirs.length + ' packages updated.\n',
);

if (errors.length > 0) {
  process.stderr.write(
    '[copy-licenses] ' + errors.length + ' error(s) occurred. Failing build.\n',
  );
  process.exit(1);
}
