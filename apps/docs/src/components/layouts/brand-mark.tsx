/**
 * @enterstellar-ai/docs — Enterstellar Logomark Component (Global Brand Asset)
 *
 * The inline SVG approach (vs `<img>`) is required so that `mix-blend-mode`
 * compositing on parent containers can sample the SVG's rendered pixels
 * directly through the GPU layer.
 *
 * **Variants**
 * | variant | fill treatment                          | typical use         |
 * |---------|----------------------------------------|---------------------|
 * | color   | Original pink→yellow linearGradient    | Hero, loader, OG    |
 * | white   | Flat white — readable on dark surfaces  | Navigation (blended)|
 * | black   | Flat near-black — readable on light     | Footer, light pages |
 *
 * **Modes**
 * | mode | class applied      | intent                         |
 * |------|--------------------|--------------------------------|
 * | icon | brandmark_icon     | Compact square icon usage      |
 * | mark | brandmark_mark     | Full logomark / brand identity |
 *
 * @module shared/brand-mark
 */

"use client";
import type { JSX } from "react";

import { useId } from "react";
export type BrandMarkVariant = "white" | "black" | "color";

export interface BrandMarkProps {
  variant?: BrandMarkVariant;
  mode?: "icon" | "mark";
  className?: string;
}

/* ==========================================================================
 * Fill resolution
 * ========================================================================== */

/**
 * Resolves the SVG `fill` attribute value for non-gradient variants.
 *
 * For `color` variant, the caller is responsible for passing the gradient
 * `url()` reference directly — this function is only used for flat fills.
 *
 * @param variant - The current color variant.
 * @param gradientId - The unique gradient ID to reference for `color` variant.
 * @returns The fill attribute value for a given path instance.
 */
function resolveFill(
  variant: BrandMarkVariant,
  gradientId: string
): string {
  switch (variant) {
    case "white":
      return "white";
    case "black":
      // Near-black matching --swatch--black design token.
      // Using the SVG fill attribute (not CSS) keeps this component
      // free of inline style props per architectural convention.
      return "#0a0a0a";
    case "color":
    default:
      return `url(#${gradientId})`;
  }
}

/* ==========================================================================
 * Component
 * ========================================================================== */

/**
 * AURA logomark — inline SVG with variant and mode controls.
 *
 * ### Usage
 * ```tsx
 * // Default: color gradient, mark mode
 * <BrandMark />
 *
 * // White for dark nav / blend-mode parent
 * <BrandMark variant="white" mode="mark" />
 *
 * // Black for footer on light background
 * <BrandMark variant="black" mode="mark" />
 *
 * // Compact icon for favicon-adjacent use
 * <BrandMark variant="color" mode="icon" />
 * ```
 */
export default function BrandMark({
  variant = "color",
  mode = "mark",
  className,
}: BrandMarkProps): JSX.Element {
  /**
   * Unique, stable ID generated once per component instance via React's
   * `useId()`. This prevents gradient ID collisions when multiple BrandMark
   * instances with `variant="color"` are rendered in the same document.
   *
   * `useId()` is SSR-safe and produces the same ID on server and client,
   * preventing hydration mismatches.
   */
  const uid = useId();
  // Sanitise the React-generated ID: useId() can produce `:r0:` style
  // strings with colons, which are invalid in SVG id attributes.
  const safeUid = uid.replace(/:/g, "_");
  const gradientIdA = `brandmark_grad_a_${safeUid}`;
  const gradientIdB = `brandmark_grad_b_${safeUid}`;

  /** CSS class applied to the root SVG element */
  const modeClass = mode === "icon" ? "brandmark_icon" : "brandmark_mark";

  /** Fill values for the two paths */
  const fillA = resolveFill(variant, gradientIdA);
  const fillB = resolveFill(variant, gradientIdB);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      viewBox="0 0 212.63 212.63"
      aria-hidden="true"
      focusable="false"
      className={[modeClass, className].filter(Boolean).join(" ")}
    >
      {/*
       * Gradient <defs> are only rendered for the color variant —
       * every SVG element (even with display:none) in the document
       * shares the same ID namespace, so unused defs are omitted
       * to keep the DOM clean.
       */}
      {variant === "color" && (
        <defs>
          {/* Primary gradient: pink → yellow (right / lower-right arm) */}
          <linearGradient
            id={gradientIdA}
            x1="126.57"
            y1="116.5"
            x2="179.21"
            y2="186.29"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#ffb1f0" />
            <stop offset="1" stopColor="#fdff00" />
          </linearGradient>

          {/* Secondary gradient: same stops, offset origin (upper / left arm) */}
          <linearGradient
            id={gradientIdB}
            x1="118.56"
            y1="122.54"
            x2="171.2"
            y2="192.33"
            xlinkHref={`#${gradientIdA}`}
          />
        </defs>
      )}

      {/* Star arm — right / lower-right paths */}
      <path
        fill={fillA}
        d="M137.77,102.35c-3.63,0-7.1,1.44-9.66,4l-21.75,21.75c-2.56,2.56-4,6.04-4,9.66v74.18c0,.38.31.68.68.68h12.3c.38,0,.68-.31.68-.68v-84.62c0-.61.74-.91,1.17-.48l85.58,85.58c.13.13.3.2.48.2h8.7c.38,0,.68-.31.68-.68v-8.7c0-.18-.07-.36-.2-.48l-85.58-85.58c-.43-.43-.13-1.17.48-1.17h84.62c.38,0,.68-.31.68-.68v-12.3c0-.38-.31-.68-.68-.68h-74.18Z"
      />

      {/* Star arm — upper / left paths */}
      <path
        fill={fillB}
        d="M211.95,0h-8.36c-.18,0-.36.07-.48.2l-88.62,88.62c-.43.43-1.17.13-1.17-.48V.68c0-.38-.31-.68-.68-.68h-12.3c-.38,0-.68.31-.68.68v87.66c0,.61-.74.91-1.17.48L9.87.2C9.74.07,9.56,0,9.38,0H.68C.31,0,0,.31,0,.68v8.7c0,.18.07.36.2.48l88.62,88.62c.43.43.13,1.17-.48,1.17H.68c-.38,0-.68.31-.68.68v12.3c0,.38.31.68.68.68h87.66c.61,0,.91.74.48,1.17L.2,203.11C.07,203.24,0,203.41,0,203.59v8.36c0,.38.31.68.68.68h9.04c.18,0,.36-.07.48-.2L212.43,10.21c.13-.13.2-.3.2-.48V.68c0-.38-.31-.68-.68-.68Z"
      />
    </svg>
  );
}
