# @flowtomic/flowgraph-core-view

Low-level, framework-agnostic rendering primitives for Flowgraph. The package exposes a `FlowgraphRenderer` class that takes a DOM container and a `FlowGraph` instance, renders nodes and connections with D3, and provides interaction hooks (dragging, selection, zoom/pan).

## Features (current status)

- SVG scene rendered with D3 selections
- Zoom and pan via `d3-zoom`
- Node dragging with pointer events (viewport-aware)
- Basic node and port rendering with automatic anchors
- Connection paths with bezier defaults or custom routing
- Interactive connection drafting between output and input ports
- Connection deletion via double-click or keyboard shortcuts
- Improved zoom/pan handling with grab cursors and double-click zoom disabled by default
- Selection helpers for nodes and connections
- Viewport synchronisation with the `FlowGraph` engine

## Usage

```ts
import { FlowGraph } from '@flowtomic/flowgraph';
import { FlowgraphRenderer } from '@flowtomic/flowgraph-core-view';

const graph = new FlowGraph();
graph.addNode({
  id: 'start',
  label: 'Webhook',
  position: { x: 80, y: 120 },
  ports: [
    { id: 'out', direction: 'output', label: 'next' },
  ],
});

const container = document.getElementById('canvas')!;
const renderer = new FlowgraphRenderer(container, graph, {
  onNodeSelect: node => console.log('Selected node', node.id),
});

// Later, when cleaning up
renderer.destroy();
```

## Roadmap

- Richer node theming hooks (custom renderers, port slotting)
- Connection drafting & hit testing helpers
- Grid overlays, minimap support, marquee selection
- Better accessibility affordances & keyboard controls