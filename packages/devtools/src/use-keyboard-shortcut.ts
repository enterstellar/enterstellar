'use client';

/**
 * @module @enterstellar-ai/devtools/use-keyboard-shortcut
 * @description React hook for detecting keyboard shortcut combos.
 *
 * Attaches a `keydown` listener to `document` and invokes the callback
 * when the specified key combination is pressed. Cleans up on unmount.
 *
 * Shortcut format: modifier keys joined with `+` (e.g., `'ctrl+shift+a'`).
 * Supported modifiers: `ctrl`, `shift`, `alt`, `meta`.
 *
 * On macOS, `ctrl` matches both `Control` and `Meta` keys to accommodate
 * users who expect `Cmd+Shift+A` to work like `Ctrl+Shift+A`.
 *
 * @see Design Choice DT2 — `Ctrl+Shift+A` toggle
 *
 * @example
 * ```tsx
 * useKeyboardShortcut('ctrl+shift+a', () => setOpen((prev) => !prev));
 * ```
 *
 * @internal
 */

import { useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Shortcut Parser
// ---------------------------------------------------------------------------

/**
 * Parsed representation of a keyboard shortcut.
 *
 * @internal
 */
type ParsedShortcut = {
    /** Whether `Ctrl` (or `Meta` on macOS) must be pressed. */
    readonly ctrl: boolean;
    /** Whether `Shift` must be pressed. */
    readonly shift: boolean;
    /** Whether `Alt` must be pressed. */
    readonly alt: boolean;
    /** Whether `Meta` (Cmd on macOS) must be pressed. */
    readonly meta: boolean;
    /** The non-modifier key (lowercase). */
    readonly key: string;
};

/**
 * Parses a shortcut string into its constituent parts.
 *
 * @param shortcut - Shortcut string (e.g., `'ctrl+shift+a'`).
 * @returns Parsed shortcut object.
 *
 * @internal
 */
export function parseShortcut(shortcut: string): ParsedShortcut {
    const parts = shortcut.toLowerCase().split('+');
    const modifiers = new Set(parts.slice(0, -1));
    const lastPart = parts[parts.length - 1];

    return {
        ctrl: modifiers.has('ctrl'),
        shift: modifiers.has('shift'),
        alt: modifiers.has('alt'),
        meta: modifiers.has('meta'),
        key: lastPart ?? '',
    };
}

/**
 * Checks whether a keyboard event matches the parsed shortcut.
 *
 * On macOS, `ctrl` in the shortcut also matches `event.metaKey`
 * to support `Cmd+Shift+A` as an alias for `Ctrl+Shift+A`.
 *
 * @param event - The keyboard event to check.
 * @param parsed - The parsed shortcut to match against.
 * @returns `true` if the event matches the shortcut.
 *
 * @internal
 */
export function matchesShortcut(event: KeyboardEvent, parsed: ParsedShortcut): boolean {
    // ctrl in shortcut matches either ctrlKey or metaKey (macOS Cmd)
    const ctrlMatch = parsed.ctrl
        ? (event.ctrlKey || event.metaKey)
        : (!event.ctrlKey && !event.metaKey);

    const shiftMatch = parsed.shift === event.shiftKey;
    const altMatch = parsed.alt === event.altKey;

    // Meta is only checked independently if explicitly in the shortcut AND ctrl is not
    const metaMatch = parsed.meta
        ? event.metaKey
        : true; // If meta is not required, we don't check it (ctrl already handles macOS)

    const keyMatch = event.key.toLowerCase() === parsed.key;

    return ctrlMatch && shiftMatch && altMatch && metaMatch && keyMatch;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Registers a keyboard shortcut listener on `document`.
 *
 * The listener is attached on mount and removed on unmount.
 * The callback reference is tracked via `useRef` to avoid
 * re-attaching the listener when the callback changes.
 *
 * @param shortcut - Shortcut string (e.g., `'ctrl+shift+a'`).
 * @param callback - Function to invoke when the shortcut is pressed.
 *
 * @see Design Choice DT2 — `Ctrl+Shift+A` + floating button
 *
 * @internal
 */
export function useKeyboardShortcut(shortcut: string, callback: () => void): void {
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    useEffect(() => {
        const parsed = parseShortcut(shortcut);

        function handleKeyDown(event: KeyboardEvent): void {
            if (matchesShortcut(event, parsed)) {
                event.preventDefault();
                callbackRef.current();
            }
        }

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [shortcut]);
}
