/**
 * @module @enterstellar-ai/cli/__tests__/detect-package-manager
 * @description Tests for lockfile-based package manager detection and install commands.
 *
 * Uses isolated temp directories with real lockfiles to test detection logic.
 * Verifies priority order, fallback to null, and install command mapping.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
    detectPackageManager,
    getInstallCommand,
} from '../src/utils/detect-package-manager.js';

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(() => {
    testDir = join(tmpdir(), `enterstellar-cli-test-pm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// detectPackageManager
// ---------------------------------------------------------------------------

describe('detectPackageManager', () => {
    it('detects pnpm from pnpm-lock.yaml', () => {
        writeFileSync(join(testDir, 'pnpm-lock.yaml'), '');

        expect(detectPackageManager(testDir)).toBe('pnpm');
    });

    it('detects npm from package-lock.json', () => {
        writeFileSync(join(testDir, 'package-lock.json'), '{}');

        expect(detectPackageManager(testDir)).toBe('npm');
    });

    it('detects yarn from yarn.lock', () => {
        writeFileSync(join(testDir, 'yarn.lock'), '');

        expect(detectPackageManager(testDir)).toBe('yarn');
    });

    it('detects bun from bun.lockb', () => {
        writeFileSync(join(testDir, 'bun.lockb'), '');

        expect(detectPackageManager(testDir)).toBe('bun');
    });

    it('returns null when no lockfile is found', () => {
        expect(detectPackageManager(testDir)).toBeNull();
    });

    it('returns null for a non-existent directory', () => {
        expect(detectPackageManager(join(testDir, 'non-existent'))).toBeNull();
    });

    // -------------------------------------------------------------------------
    // Priority order: pnpm > bun > yarn > npm
    // -------------------------------------------------------------------------

    it('prioritizes pnpm over npm when both lockfiles exist', () => {
        writeFileSync(join(testDir, 'pnpm-lock.yaml'), '');
        writeFileSync(join(testDir, 'package-lock.json'), '{}');

        expect(detectPackageManager(testDir)).toBe('pnpm');
    });

    it('prioritizes pnpm over yarn when both lockfiles exist', () => {
        writeFileSync(join(testDir, 'pnpm-lock.yaml'), '');
        writeFileSync(join(testDir, 'yarn.lock'), '');

        expect(detectPackageManager(testDir)).toBe('pnpm');
    });

    it('prioritizes bun over yarn when both lockfiles exist', () => {
        writeFileSync(join(testDir, 'bun.lockb'), '');
        writeFileSync(join(testDir, 'yarn.lock'), '');

        expect(detectPackageManager(testDir)).toBe('bun');
    });

    it('prioritizes yarn over npm when both lockfiles exist', () => {
        writeFileSync(join(testDir, 'yarn.lock'), '');
        writeFileSync(join(testDir, 'package-lock.json'), '{}');

        expect(detectPackageManager(testDir)).toBe('yarn');
    });

    it('detects pnpm first when all lockfiles are present', () => {
        writeFileSync(join(testDir, 'pnpm-lock.yaml'), '');
        writeFileSync(join(testDir, 'bun.lockb'), '');
        writeFileSync(join(testDir, 'yarn.lock'), '');
        writeFileSync(join(testDir, 'package-lock.json'), '{}');

        expect(detectPackageManager(testDir)).toBe('pnpm');
    });
});

// ---------------------------------------------------------------------------
// getInstallCommand
// ---------------------------------------------------------------------------

describe('getInstallCommand', () => {
    it('returns "npm install" for npm', () => {
        expect(getInstallCommand('npm')).toBe('npm install');
    });

    it('returns "pnpm install" for pnpm', () => {
        expect(getInstallCommand('pnpm')).toBe('pnpm install');
    });

    it('returns "yarn install" for yarn', () => {
        expect(getInstallCommand('yarn')).toBe('yarn install');
    });

    it('returns "bun install" for bun', () => {
        expect(getInstallCommand('bun')).toBe('bun install');
    });
});
