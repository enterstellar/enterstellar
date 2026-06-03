/**
 * Enterstellar Docs — Documentation Graph Visualization
 *
 * Force-directed graph rendering of the documentation page tree. Each
 * node represents a documentation page, and edges represent cross-links
 * between pages. Uses `react-force-graph-2d` for the Canvas-based
 * visualization and `d3-force` for layout simulation.
 *
 * **Architecture:**
 * - `GraphView` — Server-safe wrapper with mount guard and container ref.
 * - `ClientOnly` — Client-rendered force graph with hover tooltips,
 *   node click navigation, and d3-force configuration.
 *
 * @see lib/build-graph.ts — Builds the `Graph` data structure from source
 * @see content/ui/components/graph-view.mdx — MDX consumer
 *
 * @module
 */
'use client';
import {
  lazy,
  type ReactElement,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ForceGraphMethods,
  ForceGraphProps,
  LinkObject,
  NodeObject,
} from 'react-force-graph-2d';
import type ForceGraph2DType from 'react-force-graph-2d';

// =============================================================================
// Types
// =============================================================================

import { forceCollide, forceLink, forceManyBody } from 'd3-force';
import { useRouter } from 'fumadocs-core/framework';

/** Graph data structure containing nodes and edges for visualization. */
export interface Graph {
  /** Documentation page nodes. */
  links: Link[];
  /** Cross-reference edges between pages. */
  nodes: Node[];
}

/** Force graph node with d3-force simulation coordinates. */
export type Node = NodeObject<NodeType>;

/** Force graph link connecting two nodes. */
export type Link = LinkObject<NodeType, LinkType>;

/** Custom node data attached to each graph node. */
export interface NodeType {
  /** Display label for the node. */
  text: string;
  /** Optional description shown in the hover tooltip. */
  description?: string;
  /** IDs of neighboring nodes (populated at render time). */
  neighbors?: string[];
  /** URL path for click-through navigation. */
  url: string;
}

/** Link data type (currently unused, reserved for edge metadata). */
export type LinkType = Record<string, unknown>;

/** Props for the `GraphView` component. */
export interface GraphViewProps {
  /** The graph data structure to visualize. */
  graph: Graph;
}

// =============================================================================
// Lazy Import
// =============================================================================

/**
 * Lazy-loaded force graph component.
 *
 * The `as` cast is required because `react-force-graph-2d` uses a
 * default export that React.lazy doesn't infer generics for.
 */
const ForceGraph2D = lazy(
  () => import('react-force-graph-2d'),
) as typeof ForceGraph2DType;

// =============================================================================
// Components
// =============================================================================

/**
 * Documentation page graph visualization.
 *
 * Renders a bordered container with a client-only force-directed graph
 * inside. Uses a mount guard to prevent SSR of the Canvas-based graph.
 *
 * @param props - Component props containing the graph data.
 * @returns The graph container element.
 */
export function GraphView(props: GraphViewProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  // Mount guard: Canvas-based rendering cannot occur during SSR
  const [mount, setMount] = useState(false);
  useEffect(() => {
    setMount(true);
  }, []);

  return (
    <div
      ref={ref}
      className="relative border h-[600px] [&_canvas]:size-full rounded-xl overflow-hidden bg-fd-background"
    >
      {mount && <ClientOnly {...props} containerRef={ref} />}
    </div>
  );
}

/**
 * Client-only force graph renderer.
 *
 * Configures d3-force simulation parameters, handles node hover effects
 * (highlighting neighbors), click navigation, and custom Canvas node
 * rendering with text labels.
 *
 * @param props - Graph data props plus a container ref for computed styles.
 * @returns The force graph with tooltip overlay.
 */
function ClientOnly({
  containerRef,
  graph,
}: GraphViewProps & { containerRef: RefObject<HTMLDivElement | null> }): ReactElement {
  const graphRef = useRef<ForceGraphMethods<Node, Link> | undefined>(undefined);
  const hoveredRef = useRef<Node | null>(null);
  const router = useRouter();
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    content: string;
  } | null>(null);

  const handleNodeHover = (node: Node | null): void => {
    const graph = graphRef.current;
    if (!graph) return;
    hoveredRef.current = node;

    if (node) {
      const coords = graph.graph2ScreenCoords(node.x ?? 0, node.y ?? 0);
      setTooltip({
        x: coords.x + 4,
        y: coords.y + 4,
        content: node.description ?? 'No description',
      });
    } else {
      setTooltip(null);
    }
  };

  // Custom node rendering: circle with text label below
  const nodeCanvasObject: ForceGraphProps['nodeCanvasObject'] = (node, ctx) => {
    const container = containerRef.current;
    if (!container) return;
    const style = getComputedStyle(container);
    const fontSize = 14;
    const radius = 5;

    // ── Draw Node Circle ──────────────────────────────────────────────
    ctx.beginPath();
    ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI, false);

    // Highlight active node and its neighbors for visual drill-in
    const hoverNode = hoveredRef.current;
    const isActive = hoverNode?.id === node.id || hoverNode?.neighbors?.includes(node.id as string);

    ctx.fillStyle = isActive
      ? style.getPropertyValue('--color-fd-primary')
      : style.getPropertyValue('--color-purple-300');
    ctx.fill();

    // ── Draw Text Label ───────────────────────────────────────────────
    ctx.font = `${String(fontSize)}px Sans-Serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = getComputedStyle(container).getPropertyValue('color');
    ctx.fillText(node['text'] as string, node.x ?? 0, (node.y ?? 0) + radius + fontSize);
  };

  const linkColor = (link: Link): string => {
    const container = containerRef.current;
    if (!container) return '#999';
    const style = getComputedStyle(container);
    const hoverNode = hoveredRef.current;

    // Highlight edges connected to the hovered node
    if (
      hoverNode &&
      typeof link.source === 'object' &&
      typeof link.target === 'object' &&
      (hoverNode.id === link.source.id || hoverNode.id === link.target.id)
    ) {
      return style.getPropertyValue('--color-fd-primary');
    }

    return `color-mix(in oklab, ${style.getPropertyValue('--color-fd-muted-foreground')} 50%, transparent)`;
  };

  // ── Node Enrichment ─────────────────────────────────────────────────
  // Pre-compute neighbor lists so hover highlighting is O(1) per node.
  // Uses `structuredClone` to avoid mutating the source graph data.
  const enrichedNodes = useMemo(() => {
    const { nodes, links } = structuredClone(graph);
    for (const node of nodes) {
      node.neighbors = links.flatMap((link) => {
        if (link.source === node.id) return link.target as string;
        if (link.target === node.id) return link.source as string;
        return [];
      });
    }

    return {
      nodes,
      links,
    };
  }, [graph]);

  return (
    <>
      <ForceGraph2D<NodeType, LinkType>
        ref={{
          get current() {
            return graphRef.current;
          },
          set current(fg) {
            graphRef.current = fg;
            // Configure d3-force simulation on ref assignment:
            // - link distance: 200px spacing between connected nodes
            // - charge: 10 (mild repulsion to prevent overlap)
            // - collision: 60px radius to keep labels readable
            if (fg) {
              fg.d3Force('link', forceLink().distance(200));
              fg.d3Force('charge', forceManyBody().strength(10));
              fg.d3Force('collision', forceCollide(60));
            }
          },
        }}
        graphData={enrichedNodes}
        nodeCanvasObject={nodeCanvasObject}
        linkColor={linkColor}
        onNodeHover={handleNodeHover}
        onNodeClick={(node) => {
          router.push(node.url);
        }}
        linkWidth={2}
        enableNodeDrag
        enableZoomInteraction
      />
      {tooltip && (
        <div
          className="absolute bg-fd-popover text-fd-popover-foreground size-fit p-2 border rounded-xl shadow-lg text-sm max-w-xs"
          style={{ top: tooltip.y, left: tooltip.x }}
        >
          {tooltip.content}
        </div>
      )}
    </>
  );
}
