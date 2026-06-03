/**
 * Enterstellar Playground — Root Page (Placeholder)
 *
 * Minimal placeholder for the root route. The full landing page
 * design is handled by other developers on the enterstellar-web team.
 *
 * Currently shows a centered card with the Enterstellar logo, tagline,
 * and a prominent link to the Playground.
 *
 * @see implementation_plan.md §5.4 — Root page placeholder
 */

import Link from 'next/link';

export default function HomePage(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-neutral-950 text-neutral-50 px-6">
      {/* Logo + Tagline */}
      <div className="text-center space-y-4 max-w-lg">
        <h1 className="text-4xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-blue-400 via-primary-400 to-purple-400 bg-clip-text text-transparent">
            Enterstellar
          </span>{' '}
          Cloud
        </h1>
        <p className="text-lg text-neutral-400 leading-relaxed">
          The compiler-driven UI engine that transforms natural language
          into production-grade, type-safe user interfaces.
        </p>

        {/* CTA → Playground */}
        <div className="pt-4">
          <Link
            href="/playground"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary-500/20 text-primary-400 border border-primary-500/30 font-semibold text-sm hover:bg-primary-500/30 hover:border-primary-500/50 transition-all duration-200"
          >
            <span>⚡</span>
            <span>Try the Playground</span>
            <span className="text-primary-400/60">→</span>
          </Link>
        </div>

        <p className="text-xs text-neutral-600 pt-6">
          Full landing page coming soon — this is a development placeholder.
        </p>
      </div>
    </div>
  );
}
