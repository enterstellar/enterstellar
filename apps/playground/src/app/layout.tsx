/**
 * Enterstellar Playground — Root Layout
 *
 * The root layout for the Enterstellar Playground marketing site at `enterstellar.dev`.
 * Provides global SEO metadata (OG, Twitter, robots), font loading
 * via next/font/google (Inter + JetBrains Mono — matching our token
 * system), and the shared page shell.
 *
 * All child pages inherit this layout's metadata via Next.js's
 * built-in metadata merging. Pages can override with their own
 * `metadata` or `generateMetadata` exports.
 *
 * @see archive/CORE/enterstellar-web-implementation-plan.md §4.13 — SEO Configuration
 * @see archive/CORE/enterstellar-web-presence-appendix.md — WP5 (subpath routing)
 */
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

/**
 * Primary sans-serif font — Inter.
 * Matches `--font-sans` in `@enterstellar-web/tokens/base.css`.
 * Loaded via next/font for automatic self-hosting and zero layout shift.
 */
const fontSans = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
});

/**
 * Monospace font — JetBrains Mono.
 * Matches `--font-mono` in `@enterstellar-web/tokens/base.css`.
 * Used for code blocks, API references, and technical content.
 */
const fontMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
});

/**
 * Global SEO metadata for the Enterstellar Playground marketing site.
 *
 * - `metadataBase` resolves all relative OG/Twitter image URLs
 * - `title.template` appends ` | Enterstellar Playground` to page-level titles
 * - `robots` explicitly allows indexing (defense against accidental noindex)
 * - `alternates.canonical` consolidates domain authority to `enterstellar.dev`
 *
 * @see https://nextjs.org/docs/app/api-reference/functions/generate-metadata
 */
export const metadata: Metadata = {
  metadataBase: new URL('https://enterstellar.dev'),
  title: {
    default: 'Enterstellar Playground',
    template: '%s | Enterstellar Playground',
  },
  description:
    'The intelligence backend for AI-generated user interfaces. Type-safe, deterministic, production-grade GenUI.',
  openGraph: {
    type: 'website',
    siteName: 'Enterstellar Playground',
    locale: 'en_US',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Enterstellar Playground — The Intelligence Backend for GenUI',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@enterstellaros',
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://enterstellar.dev',
  },
};

/**
 * Root layout component wrapping all pages on `enterstellar.dev`.
 *
 * Applies Inter (sans) and JetBrains Mono (mono) font CSS variables
 * to the `<html>` element, enabling `font-sans` and `font-mono`
 * Tailwind utilities site-wide via the token system.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <html
      lang="en"
      className={`${fontSans.variable} ${fontMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
