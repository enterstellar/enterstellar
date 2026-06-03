/**
 * @module @enterstellar-ai/devtools/use-keyboard-shortcut.test
 * @description Unit tests for the keyboard shortcut hook and parser.
 *
 * Tests cover:
 * - Shortcut string parsing
 * - Key event matching (including macOS Cmd alias)
 * - Hook lifecycle (attach, fire, cleanup)
 * - Custom shortcut strings
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { parseShortcut, matchesShortcut, useKeyboardShortcut } from '../src/use-keyboard-shortcut.js';

// ---------------------------------------------------------------------------
// parseShortcut
// ---------------------------------------------------------------------------

describe('parseShortcut', () => {
    it('parses ctrl+shift+a correctly', () => {
        const result = parseShortcut('ctrl+shift+a');
        expect(result).toEqual({
            ctrl: true,
            shift: true,
            alt: false,
            meta: false,
            key: 'a',
        });
    });

    it('parses alt+k correctly', () => {
        const result = parseShortcut('alt+k');
        expect(result).toEqual({
            ctrl: false,
            shift: false,
            alt: true,
            meta: false,
            key: 'k',
        });
    });

    it('parses meta+shift+d correctly', () => {
        const result = parseShortcut('meta+shift+d');
        expect(result).toEqual({
            ctrl: false,
            shift: true,
            alt: false,
            meta: true,
            key: 'd',
        });
    });

    it('handles single key without modifiers', () => {
        const result = parseShortcut('f12');
        expect(result).toEqual({
            ctrl: false,
            shift: false,
            alt: false,
            meta: false,
            key: 'f12',
        });
    });

    it('is case-insensitive', () => {
        const result = parseShortcut('Ctrl+Shift+A');
        expect(result).toEqual({
            ctrl: true,
            shift: true,
            alt: false,
            meta: false,
            key: 'a',
        });
    });
});

// ---------------------------------------------------------------------------
// matchesShortcut
// ---------------------------------------------------------------------------

describe('matchesShortcut', () => {
    function createKeyEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
        // Cast through `unknown` — fixture is intentionally partial.
        // Full KeyboardEvent has many DOM fields not needed for shortcut matching.
        return {
            key: '',
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            ...overrides,
        } as unknown as KeyboardEvent;
    }

    it('matches ctrl+shift+a', () => {
        const parsed = parseShortcut('ctrl+shift+a');
        const event = createKeyEvent({ key: 'a', ctrlKey: true, shiftKey: true });
        expect(matchesShortcut(event, parsed)).toBe(true);
    });

    it('matches ctrl+shift+a via metaKey (macOS Cmd)', () => {
        const parsed = parseShortcut('ctrl+shift+a');
        const event = createKeyEvent({ key: 'a', metaKey: true, shiftKey: true });
        expect(matchesShortcut(event, parsed)).toBe(true);
    });

    it('rejects when key does not match', () => {
        const parsed = parseShortcut('ctrl+shift+a');
        const event = createKeyEvent({ key: 'b', ctrlKey: true, shiftKey: true });
        expect(matchesShortcut(event, parsed)).toBe(false);
    });

    it('rejects when modifier is missing', () => {
        const parsed = parseShortcut('ctrl+shift+a');
        const event = createKeyEvent({ key: 'a', ctrlKey: true, shiftKey: false });
        expect(matchesShortcut(event, parsed)).toBe(false);
    });

    it('rejects when extra modifier is pressed (no ctrl required but ctrl pressed)', () => {
        const parsed = parseShortcut('shift+a');
        const event = createKeyEvent({ key: 'a', shiftKey: true, ctrlKey: true });
        expect(matchesShortcut(event, parsed)).toBe(false);
    });

    it('is case-insensitive on key', () => {
        const parsed = parseShortcut('ctrl+a');
        const event = createKeyEvent({ key: 'A', ctrlKey: true });
        expect(matchesShortcut(event, parsed)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// useKeyboardShortcut
// ---------------------------------------------------------------------------

describe('useKeyboardShortcut', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('calls callback when shortcut is pressed', () => {
        const callback = vi.fn();
        renderHook(() => useKeyboardShortcut('ctrl+shift+a', callback));

        const event = new KeyboardEvent('keydown', {
            key: 'a',
            ctrlKey: true,
            shiftKey: true,
        });
        document.dispatchEvent(event);

        expect(callback).toHaveBeenCalledOnce();
    });

    it('does not call callback for non-matching keys', () => {
        const callback = vi.fn();
        renderHook(() => useKeyboardShortcut('ctrl+shift+a', callback));

        const event = new KeyboardEvent('keydown', {
            key: 'b',
            ctrlKey: true,
            shiftKey: true,
        });
        document.dispatchEvent(event);

        expect(callback).not.toHaveBeenCalled();
    });

    it('removes listener on unmount', () => {
        const callback = vi.fn();
        const { unmount } = renderHook(() => useKeyboardShortcut('ctrl+shift+a', callback));

        unmount();

        const event = new KeyboardEvent('keydown', {
            key: 'a',
            ctrlKey: true,
            shiftKey: true,
        });
        document.dispatchEvent(event);

        expect(callback).not.toHaveBeenCalled();
    });

    it('uses the latest callback reference', () => {
        const firstCallback = vi.fn();
        const secondCallback = vi.fn();

        const { rerender } = renderHook(
            ({ cb }) => useKeyboardShortcut('ctrl+shift+a', cb),
            { initialProps: { cb: firstCallback } },
        );

        rerender({ cb: secondCallback });

        const event = new KeyboardEvent('keydown', {
            key: 'a',
            ctrlKey: true,
            shiftKey: true,
        });
        document.dispatchEvent(event);

        expect(firstCallback).not.toHaveBeenCalled();
        expect(secondCallback).toHaveBeenCalledOnce();
    });

    it('supports custom shortcut strings', () => {
        const callback = vi.fn();
        renderHook(() => useKeyboardShortcut('alt+k', callback));

        const event = new KeyboardEvent('keydown', {
            key: 'k',
            altKey: true,
        });
        document.dispatchEvent(event);

        expect(callback).toHaveBeenCalledOnce();
    });
});
