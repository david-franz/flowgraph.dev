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

## React demos

Two Vite playgrounds live under `examples/` and both resolve `@flowtomic/flowgraph` directly to `../src`, so edits to the library hot-reload immediately:

- [`react-demo`](./examples/react-demo): feature-focused inspector that lists nodes, connections, and offers quick actions to mutate the graph.
- [`react-minimal`](./examples/react-minimal): renders the graph as positioned cards with bezier SVG connections for a visual proof-of-concept.

```bash
# from the flowgraph/ directory
cd examples/react-demo   # or examples/react-minimal
npm install
npm run dev
```

The development server renders the current graph state, allows you to add sample nodes, and demonstrates subscriptions to `FlowGraph` change events.

## Roadmap

- [ ] Rich validation hooks for custom business rules
- [ ] Snapshot/patch history utilities for undo/redo
- [ ] Adapter layer for rendering in React (Flowtomic UI)
- [ ] Serialization bindings for df++ workflow execution

This package will serve as the backbone for Flowtomic’s React-based editor and the df++ runtime integrations.