/**
 * switch-enterstellar-web-deps.ts
 *
 * Centralized CLI script that atomically switches all `@enterstellar-web/*`
 * cross-repo dependencies across every consumer `package.json` in this
 * monorepo between two modes:
 *
 * - **`file` mode** (local development):
 *   Sets each `@enterstellar-web/*` dep to a `file:` protocol path pointing to
 *   the local Enterstellar WEB repository on disk. Requires the Enterstellar WEB repo to
 *   be cloned at `../../enterstellar-web` relative to this repo root.
 *
 * - **`semver` mode** (CI / production):
 *   Sets each `@enterstellar-web/*` dep to the specified npm semver version.
 *   Use this when the packages have been published to npm (public or private).
 *
 * ## Why this script exists
 *
 * Manually editing each `package.json` when switching modes is
 * error-prone: missing one file, typos in paths, or mismatched version
 * strings across apps are silent bugs. This script makes the switch
 * atomic, idempotent, and auditable — one command, all files, logged output.
 *
 * ## Usage
 *
 * ```bash
 * # Switch to local dev mode (file: protocol)
 * tsx scripts/switch-enterstellar-web-deps.ts --mode=file
 *
 * # Switch to production mode (npm semver)
 * tsx scripts/switch-enterstellar-web-deps.ts --mode=semver --version=0.1.0
 *
 * # Dry run — preview changes without writing files
 * tsx scripts/switch-enterstellar-web-deps.ts --mode=file --dry-run
 * tsx scripts/switch-enterstellar-web-deps.ts --mode=semver --version=0.1.0 --dry-run
 * ```
 *
 * ## After switching
 *
 * Always run `pnpm install` after switching modes so the lockfile and
 * `node_modules` symlinks/hard-links are updated to match the new specs.
 *
 * @module
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The root directory of the Enterstellar monorepo.
 * Resolved relative to this script's location (`scripts/`).
 */
const REPO_ROOT = path.resolve(import.meta.dirname, '..');

/**
 * All `@enterstellar-web/*` packages managed by this script, keyed by package name.
 *
 * Each entry provides:
 * - `filePath`: The `file:` protocol path used in dev mode, relative to the
 *   consuming app's directory (i.e., relative from `apps/<app>/`).
 *
 * The path uses three `../` segments because all consumer apps live at
 * `apps/<app>/`, which is two levels below the repo root, and the Enterstellar WEB
 * repo lives as a sibling directory to the Enterstellar repo root:
 *
 * ```
 * /Users/Yassin/
 *   Enterstellar/           ← this repo root
 *     apps/
 *       docs/       ← consumer app (apps/docs)
 *       playground/  ← consumer app (apps/playground)
 *     scripts/      ← this script lives here
 *   Enterstellar WEB/       ← sibling repo
 *     packages/
 *       assets/
 *       core/
 *       tokens/
 *       ui/
 * ```
 *
 * So from `apps/docs/`, the relative path to `Enterstellar WEB/packages/assets` is:
 * `../` → `apps/`, `../` → `Enterstellar/`, `../` → `/Users/Yassin/`, then `Enterstellar WEB/packages/assets`.
 */
const Enterstellar_WEB_PACKAGES: Readonly<Record<string, { filePath: string }>> = {
  '@enterstellar-web/assets': { filePath: 'file:../../../enterstellar-web/packages/assets' },
  '@enterstellar-web/core': { filePath: 'file:../../../enterstellar-web/packages/core' },
  '@enterstellar-web/tokens': { filePath: 'file:../../../enterstellar-web/packages/tokens' },
  '@enterstellar-web/ui': { filePath: 'file:../../../enterstellar-web/packages/ui' },
} as const;

/**
 * The glob patterns that define which `package.json` files are scanned for
 * `@enterstellar-web/*` dependencies. Mirrors the `source` field in `.syncpackrc`.
 *
 * Only `apps/*` is in scope — `packages/*` are Enterstellar engine packages and
 * should never depend on `@enterstellar-web/*` (L15: engine packages have zero
 * framework deps; UI packages live in the renderer layer).
 */
const CONSUMER_GLOB_DIRS = ['apps'] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The two supported dependency modes for `@enterstellar-web/*` packages.
 *
 * - `'file'` — local development via `file:` protocol
 * - `'semver'` — published npm version (public or private registry)
 */
type DependencyMode = 'file' | 'semver';

/**
 * Parsed CLI arguments after validation.
 */
interface ParsedArgs {
  /** The target mode to switch to. */
  readonly mode: DependencyMode;
  /**
   * The semver version string to use in `semver` mode.
   * Format: `^x.y.z` — the caret is added automatically if omitted.
   * Required when `mode === 'semver'`, unused when `mode === 'file'`.
   */
  readonly version: string | null;
  /**
   * If `true`, the script logs what it would change but does not write
   * any files. Useful for CI validation and pre-flight checks.
   */
  readonly dryRun: boolean;
}

/**
 * The result of processing a single `package.json` file.
 */
interface FileResult {
  /** Absolute path to the `package.json` file. */
  readonly filePath: string;
  /** Number of `@enterstellar-web/*` entries that were updated (or would be). */
  readonly updatedCount: number;
  /** Number of `@enterstellar-web/*` entries already in the target mode (skipped). */
  readonly skippedCount: number;
  /** Whether the file was actually written (false in dry-run mode). */
  readonly written: boolean;
}

/**
 * The raw shape of a `package.json` file — only the fields we touch.
 * Using `unknown` for all dep maps and narrowing before use, per the
 * "no `any`" rule (Tier 3 strictness).
 */
interface PackageJsonShape {
  dependencies?: unknown;
  devDependencies?: unknown;
  peerDependencies?: unknown;
  optionalDependencies?: unknown;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Parses and validates `process.argv` into a {@link ParsedArgs} object.
 *
 * @throws {Error} If required arguments are missing or invalid.
 * @returns The validated parsed arguments.
 */
function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const argMap = new Map<string, string>();

  for (const arg of args) {
    const [key, val] = arg.startsWith('--') ? arg.slice(2).split('=') : [];
    if (key !== undefined) {
      argMap.set(key, val ?? 'true');
    }
  }

  const rawMode = argMap.get('mode');
  if (rawMode !== 'file' && rawMode !== 'semver') {
    throw new Error(
      `[switch-enterstellar-web-deps] --mode is required and must be "file" or "semver".\n` +
        `  Got: ${rawMode ?? '(missing)'}\n` +
        `  Usage: tsx scripts/switch-enterstellar-web-deps.ts --mode=file\n` +
        `         tsx scripts/switch-enterstellar-web-deps.ts --mode=semver --version=0.1.0`,
    );
  }

  const mode: DependencyMode = rawMode;
  const version = argMap.get('version') ?? null;

  if (mode === 'semver' && version === null) {
    throw new Error(
      `[switch-enterstellar-web-deps] --version is required when --mode=semver.\n` +
        `  Usage: tsx scripts/switch-enterstellar-web-deps.ts --mode=semver --version=0.1.0`,
    );
  }

  const dryRun = argMap.get('dry-run') === 'true';

  return { mode, version, dryRun };
}

/**
 * Resolves the target version string for a given package in a given mode.
 *
 * In `file` mode, returns the `file:` path from {@link Enterstellar_WEB_PACKAGES}.
 * In `semver` mode, returns the version with a `^` caret prefix (if not
 * already present), as is standard for `package.json` semver ranges.
 *
 * @param pkgName - The `@enterstellar-web/*` package name.
 * @param mode - The target dependency mode.
 * @param version - The semver version string (required in `semver` mode).
 * @returns The resolved version string to write to `package.json`.
 */
function resolveTargetVersion(
  pkgName: string,
  mode: DependencyMode,
  version: string | null,
): string {
  if (mode === 'file') {
    const entry = Enterstellar_WEB_PACKAGES[pkgName];
    // This branch is only reached for keys that exist in Enterstellar_WEB_PACKAGES
    // (we guard the call site), so entry is always defined here.
    if (entry === undefined) {
      throw new Error(`[switch-enterstellar-web-deps] Unknown package: ${pkgName}`);
    }
    return entry.filePath;
  }

  // mode === 'semver'
  // version is guaranteed non-null by parseArgs() when mode is 'semver'.
  const v = version as string;
  return v.startsWith('^') || v.startsWith('~') || v.startsWith('>=')
    ? v
    : `^${v}`;
}

/**
 * Checks whether a dep map object (from `package.json`) is a plain record
 * of string-to-string entries. Narrows the `unknown` type to
 * `Record<string, string>` for safe mutation.
 *
 * @param value - The value to check.
 * @returns `true` if the value is a `Record<string, string>`.
 */
function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === 'string')
  );
}

// ---------------------------------------------------------------------------
// Core Logic
// ---------------------------------------------------------------------------

/**
 * Discovers all `package.json` files inside the consumer directories
 * defined by {@link CONSUMER_GLOB_DIRS}.
 *
 * Only direct children of each consumer directory are scanned (i.e.,
 * `apps/docs/package.json`, not `apps/docs/src/something/package.json`).
 *
 * @returns An array of absolute paths to discovered `package.json` files.
 */
function discoverConsumerManifests(): string[] {
  const manifests: string[] = [];

  for (const dir of CONSUMER_GLOB_DIRS) {
    const dirPath = path.join(REPO_ROOT, dir);

    if (!fs.existsSync(dirPath)) {
      console.warn(`[switch-enterstellar-web-deps] Warning: directory not found, skipping: ${dirPath}`);
      continue;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(dirPath, entry.name, 'package.json');
      if (fs.existsSync(manifestPath)) {
        manifests.push(manifestPath);
      }
    }
  }

  return manifests;
}

/**
 * Processes a single `package.json` file, updating any `@enterstellar-web/*`
 * dependency entries to the target mode's version string.
 *
 * The function:
 * 1. Reads and parses the file.
 * 2. Iterates over all dep map fields (`dependencies`, `devDependencies`, etc.).
 * 3. For each `@enterstellar-web/*` entry found, updates it if it is not already
 *    at the target version.
 * 4. If any changes were made, writes the result back atomically via a
 *    temp file + `fs.renameSync` (unless `dryRun` is true).
 *
 * @param manifestPath - Absolute path to the `package.json` file.
 * @param mode - The target dependency mode.
 * @param version - The semver version string (required in `semver` mode).
 * @param dryRun - If `true`, no files are written.
 * @returns A {@link FileResult} describing what happened (or would happen).
 */
function processManifest(
  manifestPath: string,
  mode: DependencyMode,
  version: string | null,
  dryRun: boolean,
): FileResult {
  const raw = fs.readFileSync(manifestPath, 'utf-8');
  const json = JSON.parse(raw) as PackageJsonShape;

  const depFields = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ] as const;

  let updatedCount = 0;
  let skippedCount = 0;
  let dirty = false;

  for (const field of depFields) {
    const depMap = json[field];
    if (!isStringRecord(depMap)) continue;

    for (const pkgName of Object.keys(Enterstellar_WEB_PACKAGES)) {
      const currentValue = depMap[pkgName];
      if (currentValue === undefined) continue; // not present in this dep map

      const targetValue = resolveTargetVersion(pkgName, mode, version);

      if (currentValue === targetValue) {
        skippedCount++;
        console.log(
          `  ${dryRun ? '[dry-run] ' : ''}↩  ${pkgName} already at target "${targetValue}" in ${field} — skipped`,
        );
      } else {
        depMap[pkgName] = targetValue;
        updatedCount++;
        dirty = true;
        console.log(
          `  ${dryRun ? '[dry-run] ' : ''}✎  ${pkgName}: "${currentValue}" → "${targetValue}" (${field})`,
        );
      }
    }
  }

  let written = false;

  if (dirty && !dryRun) {
    // Atomic write: write to a temp file, then rename to the target.
    // This prevents partial writes from corrupting the manifest on disk
    // if the process is interrupted mid-write.
    const tempPath = `${manifestPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(json, null, 2) + '\n', 'utf-8');
    fs.renameSync(tempPath, manifestPath);
    written = true;
  }

  return { filePath: manifestPath, updatedCount, skippedCount, written };
}

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------

/**
 * Main entry point. Parses arguments, discovers consumer manifests,
 * processes each one, and prints a summary.
 */
function main(): void {
  let args: ParsedArgs;
  try {
    args = parseArgs();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(1);
  }

  const { mode, version, dryRun } = args;

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║          switch-enterstellar-web-deps                            ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Mode    : ${mode}${mode === 'semver' ? ` (version: ^${version})` : ''}`);
  console.log(`  Dry run : ${dryRun ? 'YES — no files will be written' : 'no'}`);
  console.log('');

  const manifests = discoverConsumerManifests();

  if (manifests.length === 0) {
    console.warn('[switch-enterstellar-web-deps] No consumer package.json files found. Nothing to do.');
    process.exit(0);
  }

  console.log(`Found ${manifests.length} consumer manifest(s):`);

  const results: FileResult[] = [];

  for (const manifestPath of manifests) {
    const relPath = path.relative(REPO_ROOT, manifestPath);
    console.log(`\n▸ ${relPath}`);
    const result = processManifest(manifestPath, mode, version, dryRun);
    results.push(result);
  }

  // Summary
  const totalUpdated = results.reduce((acc, r) => acc + r.updatedCount, 0);
  const totalSkipped = results.reduce((acc, r) => acc + r.skippedCount, 0);
  const totalWritten = results.filter((r) => r.written).length;

  console.log('');
  console.log('─────────────────────────────────────────────────────────');
  console.log(`  Summary:`);
  console.log(`    Entries updated : ${totalUpdated}`);
  console.log(`    Entries skipped : ${totalSkipped} (already at target)`);
  if (!dryRun) {
    console.log(`    Files written   : ${totalWritten}`);
    if (totalUpdated > 0) {
      console.log('');
      console.log('  ⚡ Run `pnpm install` to sync node_modules with the new specs.');
    }
  } else {
    console.log('');
    console.log('  [dry-run] No files were written. Remove --dry-run to apply changes.');
  }
  console.log('');
}

main();
