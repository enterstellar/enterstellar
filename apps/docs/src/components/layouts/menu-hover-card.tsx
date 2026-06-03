/**
 * Enterstellar Docs — Link Preview Hover Card
 *
 * Wraps `@radix-ui/react-hover-card` with Fumadocs design tokens and
 * Tailwind styling. Renders a floating card when users hover over
 * internal documentation links, showing a preview of the linked page.
 *
 * **Architecture:**
 * - `HoverCard` — Root container (Radix state management).
 * - `HoverCardTrigger` — Wraps a `fumadocs-core/link` element. The
 *   `asChild` prop ensures the trigger inherits the link's `<a>` element
 *   semantics (keyboard focus, accessibility).
 * - `HoverCardContent` — Portal-rendered popup with Fumadocs popover
 *   animations (`animate-fd-popover-in`/`out`).
 *
 * **Consumer:** Used exclusively by the docs page component
 * (`app/(docs)/[[...slug]]/page.tsx`) to enable hover previews for
 * cross-reference links in MDX content.
 *
 * @see app/(docs)/[[...slug]]/page.tsx — Wraps `<a>` tags with this component
 * @see {@link https://www.radix-ui.com/primitives/docs/components/hover-card Radix HoverCard}
 *
 * @module
 */
'use client';

import type { ComponentProps, ComponentPropsWithoutRef, ComponentRef, ReactElement } from 'react';
import { forwardRef } from 'react';
import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import { cn } from '@/lib/cn';
import Link from 'fumadocs-core/link';

/**
 * Root hover card container.
 *
 * Manages open/close state and pointer interaction timing. Renders no
 * DOM element — state is passed to children via React context.
 */
const HoverCard = HoverCardPrimitive.Root;

/**
 * Hover card trigger wrapper.
 *
 * Renders the trigger as a `fumadocs-core/link` element using Radix's
 * `asChild` composition pattern. This ensures the trigger is a semantic
 * `<a>` tag with proper keyboard and screen reader accessibility.
 *
 * @param props - Radix HoverCard trigger props, forwarded to the inner Link.
 * @returns The trigger Link element.
 */
function HoverCardTrigger(
  props: ComponentProps<typeof HoverCardPrimitive.Trigger>,
): ReactElement {
  return (
    <HoverCardPrimitive.Trigger asChild>
      <Link {...props} />
    </HoverCardPrimitive.Trigger>
  );
}

/**
 * Hover card content panel.
 *
 * Portal-mounted floating card that appears on hover. Includes Fumadocs
 * design tokens for border, background, shadow, and popover
 * animations. The `origin-[--radix-hover-card-content-transform-origin]`
 * class ensures the scale animation originates from the trigger element.
 *
 * @param props - Radix HoverCard content props.
 * @param props.className - Additional CSS classes merged with defaults.
 * @param props.align - Horizontal alignment relative to the trigger. Defaults to `'center'`.
 * @param props.sideOffset - Vertical offset from the trigger in pixels. Defaults to `4`.
 * @param ref - Forwarded ref to the underlying Radix content element.
 * @returns The portal-rendered hover card panel.
 */
const HoverCardContent = forwardRef<
  ComponentRef<typeof HoverCardPrimitive.Content>,
  ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, align = 'center', sideOffset = 4, ...props }, ref) => (
  <HoverCardPrimitive.HoverCardPortal>
    <HoverCardPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-50 w-72 rounded-lg border bg-fd-popover p-4 text-popover-fd-foreground shadow-md outline-none data-[state=open]:animate-fd-popover-in data-[state=closed]:animate-fd-popover-out origin-[--radix-hover-card-content-transform-origin]',
        className,
      )}
      {...props}
    />
  </HoverCardPrimitive.HoverCardPortal>
));
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName;

export { HoverCard, HoverCardTrigger, HoverCardContent };
