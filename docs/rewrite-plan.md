# Flowgraph React/D3 Rewrite Plan

This document records the findings from the review of the existing Angular `FlowCanvasComponent` and outlines the strategy for the new React + D3 implementation of the Flowgraph frontend library. The goal is to provide a reusable, framework-agnostic renderer that pairs with the `@flowtomic/flowgraph` state engine and can be embedded in a wide range of products (Flowtomic, internal tooling, external partners).

## 1. Findings from the current Angular FlowCanvas

The Angular `FlowCanvasComponent` (`frontend/src/app/components/flow-canvas/flow-canvas.component.ts`) is feature rich but difficult to evolve. Key observations:

- **Monolithic component**: 2k+ lines of tightly coupled logic for rendering, selection, drag/drop, overlays, settings, data-model integration, blueprint handling, AI service calls, etc. There is no separation between domain logic and UI concerns.
- **State management is ad-hoc**: Internal state is spread across component fields, injected services, and global singletons (e.g. `window`, `document`). Updating one concept (like form instances) requires touching multiple unrelated branches rather than a single reducer.
- **Difficult to reason about performance**: Direct DOM manipulation (`document.getElementById`, manual overlay management, manual change detection) competes with Angular's change detection. This makes subtle bugs likely and limits portability.
- **Non-reusable rendering primitives**: Layout rules, port hit-testing, connection drawing, and group sizing are hard-coded. Reusing the canvas outside of the current Angular shell would require copying most of the component.
- **Missing abstractions for new features**: The rewrite needs better support for custom node renderers, dynamic forms, embedded inspectors, and alternate graph types (UML, nodal diagrams, RAG flows). The current implementation does not expose extension points.
- **UI dependencies**: The component bundles logic for modals, data models, AI service prompts, etc. These should live in product-specific shells rather than the core canvas library.

Collectively these findings justify a fresh start focused on composability and framework interoperability.

## 2. High-level goals for the new library

1. **Framework-friendly core**: Provide a renderer that speaks in plain TypeScript and DOM APIs (via D3) so it can power React/Next.js apps and also ship as plain JS/TS.
2. **React-first bindings**: Publish `@flowtomic/flowgraph-react` components that wrap the core renderer, integrate with React state, and expose hooks for custom UIs.
3. **D3-powered scene graph**: Use D3 (selection, zoom/pan, drag, shapes) to manage the SVG/canvas layer. This keeps the rendering performant and expressive while still exposing React-friendly controls.
4. **Composable building blocks**: Expose primitives (GraphCanvas, NodeLayer, ConnectionLayer, MiniMap, Navigator, Controls) so product teams can assemble bespoke editors.
5. **Programmatic API parity**: Every action available in the UI (create node, connect, group, annotate) must map to a method on the `FlowGraph` engine. The renderer should never own business state.
6. **Extensibility**: Support pluggable node renderers, port widgets, and connection styles. Enable custom hit testing and constraint logic (for UML, pipelines, etc.).
7. **Embeddable**: Ship a single React component (e.g. `<FlowgraphComposer />`) that wraps the canvas, navigator, property inspector, and toolbar for quick embedding.
8. **Examples**: Maintain curated demos that show distinct scenarios (basic builder, RAG flow, UML, embedded inspector) and double as integration tests.

## 3. Proposed package structure

```
flowgraph/
  src/
    (unchanged) core state engine
  packages/
    core-view/           # D3 rendering primitives (no React dependency)
      src/
        canvas/
        layers/
        interactions/
        utils/
    react/               # React bindings for the core view
      src/
        components/
        hooks/
        context/
        styles/
    examples/
      basic-react/
      rag-designer/
      uml-editor/
      showcase/
```

- **`core-view`**: Export an imperative `FlowgraphRenderer` class that takes a container element, a `FlowGraph` instance (or snapshot) and configuration callbacks (for node sizing, port layout, connection styling). Internally manages D3 selections, zoom/pan, drag/drop, keyboard shortcuts, and hit testing.
- **`react`**: Provide declarative components (`<FlowCanvas />`, `<FlowControls />`, `<Navigator />`) that internally host a `FlowgraphRenderer` and sync with React state via hooks (`useFlowgraph`, `useSelection`, `useViewport`).
- **Examples**: Each example imports the React package and demonstrates a specific use-case. They should rely on the same published API as consumers.

## 4. Core rendering architecture

### 4.1 Renderer lifecycle

1. **Initialization**: `FlowgraphRenderer` receives a host element and configuration (node renderers, port shapes, connection style, interaction rules). It creates an SVG scene with layers (grid, connections, nodes, overlays).
2. **Data binding**: On each `FlowGraph` update, the renderer receives a snapshot. It performs D3 joins keyed by node/connection IDs to update existing elements, create new ones, and remove stale ones.
3. **Interaction handling**: D3 behaviors manage zoom/pan, node dragging, marquee selection, port hover, and connection drafting. Interactions emit events back to the host (React bindings) to mutate the `FlowGraph` state.
4. **Customization hooks**: Consumers can provide callbacks (e.g. `renderNode`, `renderPort`, `renderConnection`, `getConnectionPath`, `isPortConnectable`). Default implementations cover Flowtomic's use-case.

### 4.2 Layers

- **Grid layer**: Optional background grid / debug overlays.
- **Group layer**: Render group rectangles with handles for resizing/label editing.
- **Connection layer**: SVG paths with arrow markers; support straight lines, orthogonal, and bezier curves.
- **Node layer**: Node container with header, port columns, custom content region. Supports injecting arbitrary DOM via portal-like API.
- **HUD layer**: Selection boxes, marquee, tooltips, quick actions.

### 4.3 Interaction model

- Zoom & pan (wheel + modifiers) with configurable bounds and persistence to `FlowGraph.setViewport`.
- Node drag with snapping (grid, align-to-node) and constraint callbacks.
- Port hover feedback, connection drafting with preview path, connection validation via `FlowGraph` port rules + user-defined constraints.
- Selection (click, shift-click, marquee) with event emission for host UI to react (e.g. open inspector).
- Keyboard shortcuts (delete, duplicate, center, undo/redo stub for future history module).

## 5. React bindings

The React package wraps the renderer with idiomatic hooks:

- `useFlowgraph(options)` → returns `{ graph, state, history }` hooking into `FlowGraph` updates.
- `<FlowCanvas graph={graph} renderer={rendererConfig} onSelect={...} />` handles DOM mounting and resizes.
- Context providers for selection, viewport, and command palette.
- Headless components for inspector panes that subscribe to selection context.
- Support for controlled/uncontrolled modes (pass your own `FlowGraph` or let the component create and manage one).

## 6. Planned feature milestones

1. **MVP (Weeks 1–2)**
   - Scaffold packages (`core-view`, `react`).
   - Implement renderer skeleton with nodes + connections + drag/zoom.
   - Provide React hook + `<FlowCanvas>` component.
   - Ship basic React example demonstrating interactive editing.

2. **Enhanced interactions (Weeks 3–4)**
   - Port grouping, selection marquee, keyboard shortcuts.
   - Add navigator overlay + viewport minimap.
   - Introduce connection routing strategies (bezier, orthogonal).

3. **Extensibility pass (Weeks 5–6)**
   - Custom node/port renderers via slot callbacks.
   - Inspector panel integration (forms, metadata editing) through React portals.
   - Plugin system for validation + custom behaviors.

4. **Showcase + polish (Weeks 7–8)**
   - Build example gallery (flow builder, RAG chain editor, UML chart, embedded mini canvas).
   - Document API (typed configs, events, styling tokens).
   - Performance tuning + accessibility review.

## 7. Immediate next actions

1. **Stabilize `@flowtomic/flowgraph`**: audit remaining gaps (connection updates, group resizing metadata, undo/redo hooks) so the engine covers all editor scenarios.
2. **Create renderer package scaffolding**: set up build tooling (TS + Vite/Rollup), linting, and storybook/playroom for interactive testing.
3. **Prototype D3 canvas**: implement core D3 zoom/pan + node drag behavior against existing demo data to validate architecture.
4. **Define public API**: draft TypeScript interfaces for renderer config, event payloads, and React props.
5. **Plan migration**: identify functionality in the Angular component that must be replicated vs. delegated to product-specific shells (e.g. AI dialogs remain outside core).

Documenting these steps provides a concrete roadmap for migrating from the legacy Angular canvas to a modular React/D3 library that matches Flowtomic’s requirements.
