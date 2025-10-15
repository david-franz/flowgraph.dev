# FlowGraph.ts

`@flowtomic/flowgraph` is the framework-agnostic graph state engine that will power the upcoming Flowtomic React UI. It focuses on the core primitives required to model workflows:

- Nodes with arbitrary configuration schemas and custom form definitions
- Typed input/output ports with connection constraints
- Directed connections with validation and routing metadata
- Hierarchical groups for organising complex flows
- Immutable snapshots & change events that UI layers can observe

The library is written in modern TypeScript and can run in both browser and Node runtimes. It does **not** depend on Angular; React bindings will live in a neighbouring package once the graph core stabilises.

## Getting started

```bash
cd flowgraph
npm install      # installs typescript for development
npm run build    # generates ESM output in dist/
```

The primary entry point is the `FlowGraph` class:

```ts
import { FlowGraph } from '@flowtomic/flowgraph';

const graph = new FlowGraph();

graph.addNode({
  id: 'gpt-call',
  label: 'GPT Request',
  position: { x: 120, y: 80 },
  ports: [
    { id: 'in', direction: 'input', label: 'trigger' },
    { id: 'success', direction: 'output', label: 'success' },
    { id: 'error', direction: 'output', label: 'error', allowLoopback: true },
  ],
  form: {
    sections: [
      {
        id: 'config',
        title: 'Inference configuration',
        fields: [
          { id: 'model', label: 'Model', kind: 'select', options: [{ value: 'dfpp:4', label: 'df++ 4' }] },
          { id: 'prompt', label: 'Prompt', kind: 'textarea' },
        ],
      },
    ],
  },
});

graph.subscribe(event => {
  console.log(event.reason, event.state.nodes.length);
});
```

## Examples

Three example projects (plus a CLI sample) live under `examples/`. All of them resolve `@flowtomic/flowgraph` directly to `../src`, so edits to the library hot-reload immediately.

| Example | Description | Getting started |
| --- | --- | --- |
| [`react-demo`](./examples/react-demo) | A feature-focused inspector showing subscription flows, quick actions, and realtime state views. | `cd examples/react-demo && npm install && npm run dev`
| [`react-minimal`](./examples/react-minimal) | Theme playground with a fully interactive canvas (drag nodes, draft/delete edges), navigation overlay, and canvas controls. | `cd examples/react-minimal && npm install && npm run dev`
| [`flowtomic-lite`](./examples/flowtomic-lite) | A Flowtomic-inspired builder with node templates, form editing, navigator, and inspector panes—demonstrating separation between library logic and UI implementation. | `cd examples/flowtomic-lite && npm install && npm run dev`
| [`showcase`](./examples/showcase) | Embeds all demos behind a single tabbed interface for quick comparisons and embedding. | `cd examples/showcase && npm install && npm run dev`
| [`node-cli`](./examples/node-cli) | Minimal CLI that assembles a workflow and prints a navigator summary—ideal for non-UI integrations. | `cd examples/node-cli && npm install && npm run start`

Each demo includes the standard **FlowGraph Navigator** overlay which can be toggled on/off and keeps track of nodes, connections, and groups for the current graph.

## Package family

This repository now houses the broader Flowgraph toolkit:

- **`@flowtomic/flowgraph`** – core state engine (this package).
- **`@flowtomic/flowgraph-core-view`** – D3-powered renderer that turns graph state into an interactive SVG scene.
- **`@flowtomic/flowgraph-react`** – React bindings (hooks + components) that wrap the core renderer for declarative apps.

The additional packages live under `packages/` and are still under active development. They compile independently with `npm run build` executed inside each directory.

## Roadmap

- [ ] Rich validation hooks for custom business rules
- [ ] Snapshot/patch history utilities for undo/redo
- [ ] Adapter layer for rendering in React (Flowtomic UI)
- [ ] Serialization bindings for df++ workflow execution

This package will serve as the backbone for Flowtomic’s React-based editor and the df++ runtime integrations.