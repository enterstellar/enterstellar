/**
 * @module playground/components/playground/forge-badge
 * @description Cloud/Forge mode indicator badge.
 *
 * Shows "⚡ Generated Live by Enterstellar Playground" when Cloud mode is active.
 * Includes a CTA link → future CloudForge product page.
 *
 * Purple accent with subtle glow, distinct from standard pipeline
 * badges. Only rendered when `mode === 'cloud'`.
 *
 * @see implementation_plan.md §4.15 — Forge Badge
 */
'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the {@link ForgeBadge} component.
 */
interface ForgeBadgeProps {
  /** Whether the badge is visible (only in Cloud mode). */
  readonly isVisible: boolean;
  /** Optional CSS class name. */
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// ForgeBadge Component
// ---------------------------------------------------------------------------

/**
 * Cloud/Forge mode indicator badge.
 *
 * Renders a premium purple badge with:
 * - "⚡ Generated Live by Enterstellar Playground" label
 * - "Learn More About CloudForge →" CTA link
 * - Subtle glow animation for premium feel
 *
 * Only visible when `isVisible` is `true` (Cloud mode active).
 */
export function ForgeBadge({
  isVisible,
  className,
}: ForgeBadgeProps): React.JSX.Element | null {
  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        'inline-flex flex-col items-start gap-1.5 px-4 py-3 rounded-xl',
        'bg-cloud/10 border border-cloud/25',
        'shadow-[0_0_20px_rgba(168,85,247,0.1)]',
        className,
      )}
    >
      {/* Badge label */}
      <div className="flex items-center gap-2">
        <motion.span
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="text-sm"
        >
          ⚡
        </motion.span>
        <span className="text-xs font-semibold text-cloud">
          Generated Live by Enterstellar Playground
        </span>
      </div>

      {/* CTA link */}
      <a
        href="/cloud"
        className="text-[10px] font-medium text-cloud/70 hover:text-cloud transition-colors group"
      >
        Learn More About CloudForge
        <span className="inline-block ml-1 group-hover:translate-x-0.5 transition-transform">
          →
        </span>
      </a>
    </motion.div>
  );
}
