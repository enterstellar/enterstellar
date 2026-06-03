/**
 * @module @enterstellar-ai/devtools/export-traces
 * @description Utility for exporting DevTools traces as a downloadable JSON file.
 *
 * Creates a {@link TraceExportBundle} containing all buffered traces
 * and zone configurations, then triggers a browser file download.
 * The resulting `.json` file can be shared with collaborators or
 * imported into `@enterstellar-ai/test` via `harness.loadTrace()`.
 *
 * @see Design Choice DT8 — JSON export via download
 *
 * @example
 * ```ts
 * import { exportTraces } from '@enterstellar-ai/devtools';
 *
 * exportTraces(allTraces, zoneConfigs);
 * // → downloads "enterstellar-traces-2026-02-22T01-02-03.json"
 * ```
 */

import type { ZoneTrace } from '@enterstellar-ai/types';
import type { TraceExportBundle } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Current SDK version embedded in the export bundle.
 * Updated manually on each release (matches `@enterstellar-ai/types` version).
 */
const SDK_VERSION = '0.0.0';

// ---------------------------------------------------------------------------
// Filename Generator
// ---------------------------------------------------------------------------

/**
 * Generates a timestamped filename for the export.
 *
 * Format: `enterstellar-traces-YYYY-MM-DDTHH-MM-SS.json`
 * Colons are replaced with dashes for filesystem compatibility.
 *
 * @returns A safe filename string.
 *
 * @internal
 */
export function generateExportFilename(): string {
    const timestamp = new Date()
        .toISOString()
        .replace(/:/g, '-')
        .replace(/\.\d{3}Z$/, '');
    return `enterstellar-traces-${timestamp}.json`;
}

// ---------------------------------------------------------------------------
// Bundle Creator
// ---------------------------------------------------------------------------

/**
 * Creates a serializable {@link TraceExportBundle} from the given data.
 *
 * This is a pure function — it does not trigger any side effects.
 * Useful for testing the bundle shape without triggering a download.
 *
 * @param traces - The traces to include in the bundle.
 * @param zoneConfigs - Snapshot of zone configurations at export time.
 * @returns A complete, serializable export bundle.
 *
 * @internal
 */
export function createExportBundle(
    traces: readonly ZoneTrace[],
    zoneConfigs: Readonly<Record<string, unknown>>,
): TraceExportBundle {
    return {
        exportedAt: new Date().toISOString(),
        sdkVersion: SDK_VERSION,
        traces,
        zoneConfigs,
    };
}

// ---------------------------------------------------------------------------
// File Download Trigger
// ---------------------------------------------------------------------------

/**
 * Triggers a browser file download for the given content.
 *
 * Creates a temporary `<a>` element with a `Blob` URL, clicks it,
 * then cleans up. This is the standard pattern for programmatic
 * downloads without a server round-trip.
 *
 * No-ops silently if `document` is not available (SSR safety).
 *
 * @param content - The string content to download.
 * @param filename - The filename for the downloaded file.
 *
 * @internal
 */
export function triggerDownload(content: string, filename: string): void {
    if (typeof document === 'undefined') {
        return;
    }

    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';

    document.body.appendChild(anchor);
    anchor.click();

    // Cleanup: remove element and revoke blob URL
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Exports DevTools traces as a downloadable JSON file.
 *
 * Creates a {@link TraceExportBundle} containing all provided traces
 * and zone configurations, serializes it to JSON with 2-space indentation,
 * and triggers a browser file download.
 *
 * The exported file can be:
 * - Shared with collaborators for offline debugging
 * - Imported into `@enterstellar-ai/test` via `harness.loadTrace()`
 * - Analyzed in external tools (JSON-compatible)
 *
 * @param traces - All traces to include in the export.
 * @param zoneConfigs - Snapshot of current zone configurations.
 *
 * @see Design Choice DT8 — JSON export via download
 */
export function exportTraces(
    traces: readonly ZoneTrace[],
    zoneConfigs: Readonly<Record<string, unknown>>,
): void {
    const bundle = createExportBundle(traces, zoneConfigs);
    const json = JSON.stringify(bundle, null, 2);
    const filename = generateExportFilename();
    triggerDownload(json, filename);
}
