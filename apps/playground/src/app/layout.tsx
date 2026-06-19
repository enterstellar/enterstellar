/**
 * Enterstellar Playground — Root Layout
 *
 * The root layout for the Enterstellar Playground. Provides global SEO metadata
 * (OG, Twitter, robots), font loading via next/font/google (Inter + JetBrains Mono),
 * full-dark-mode background wrapper, and client-side `PlaygroundProviders`
 * (Provider + LiveAgentConnection) for the playground experience.
 *
 * This is a server component so that Next.js can statically extract `metadata`.
 * The actual client-side Enterstellar context is provided by `PlaygroundProviders`.
 *
 * @see PlaygroundProviders — client-side Enterstellar context wrapper
 */
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { PlaygroundProviders } from '@/components/playground/playground-providers';
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
 * Global SEO metadata for the Enterstellar Playground.
 *
 * - `metadataBase` resolves all relative OG/Twitter image URLs
 * - `robots` explicitly allows indexing
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
    'Interactive Enterstellar Compiler playground. Try type-safe GenUI with live AI demos — MetricCards, DataTables, multi-zone dashboards, and more.',
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
 * utilities site-wide, and wraps children with `PlaygroundProviders`
 * for the playground context.
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
      <body className="min-h-full flex flex-col">
        <div className="min-h-dvh bg-playground-bg text-neutral-100 flex flex-col">
          <PlaygroundProviders>{children}</PlaygroundProviders>
        </div>
      </body>
    </html>
  );
}
