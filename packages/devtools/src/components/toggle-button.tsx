'use client';

/**
 * @module @enterstellar-ai/devtools/components/toggle-button
 * @description Floating action button (⚡) for toggling the DevTools panel.
 *
 * Renders as a fixed-position circular button in one of four viewport
 * corners. When clicked, fires `onToggle` to open/close the panel.
 *
 * Styled via centralized `styles.ts` — no external CSS.
 * Accessible: includes `aria-label` and `aria-expanded`.
 *
 * @see Design Choice DT2 — floating toggle button
 *
 * @internal
 */

import type { ToggleButtonProps } from '../types.js';
import { toggleButtonStyles, togglePositionStyles } from '../styles.js';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Floating toggle button for the DevTools panel.
 *
 * Renders a ⚡ icon button at the specified viewport corner.
 * Communicates panel state via `aria-expanded`.
 *
 * @param props - {@link ToggleButtonProps}
 * @returns The toggle button element.
 *
 * @see Design Choice DT2 — `Ctrl+Shift+A` + floating button
 *
 * @internal
 */
export function ToggleButton(props: ToggleButtonProps): React.JSX.Element {
    const { isOpen, onToggle, position } = props;

    /**
     * Merge base button styles with position-specific offsets.
     * Position key is validated at the type level via `ToggleButtonProps`.
     */
    const positionStyle = togglePositionStyles[position] ?? togglePositionStyles['bottom-right'];
    const mergedStyle: React.CSSProperties = {
        ...toggleButtonStyles['button'],
        ...positionStyle,
    };

    return (
        <button
            type="button"
            onClick={onToggle}
            style={mergedStyle}
            aria-label={isOpen ? 'Close Enterstellar DevTools' : 'Open Enterstellar DevTools'}
            aria-expanded={isOpen}
            data-enterstellar-devtools-toggle=""
        >
            ⚡
        </button>
    );
}
