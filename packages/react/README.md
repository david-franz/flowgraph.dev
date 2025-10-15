# @flowtomic/flowgraph-react

React bindings for the Flowgraph renderer. This package wraps the imperative D3 renderer in declarative components and hooks that feel natural inside React applications.

## What's included

- `useFlowgraph` hook – creates or reuses a `FlowGraph` instance and keeps React state in sync with graph updates.
- `<FlowCanvas />` component – mounts a `FlowgraphRenderer` inside a React component tree, exposing refs for viewport access and callbacks for renderer readiness.

## Basic example

```tsx
import { FlowCanvas, useFlowgraph } from '@flowtomic/flowgraph-react';

export const Demo = () => {
  const { graph, state } = useFlowgraph();

  useEffect(() => {
    if (state.nodes.length === 0) {
      graph.addNode({
        id: 'start',
        label: 'Trigger',
        position: { x: 120, y: 160 },
        ports: [{ id: 'out', direction: 'output' }],
      });
    }
  }, [graph, state.nodes.length]);

  return (
    <div style={{ width: '100%', height: '480px' }}>
      <FlowCanvas graph={graph} />
    </div>
  );
};
```

## Next steps

- Controlled selection and viewport props
- Optional overlays (navigator, minimap, toolbar)
- Storybook examples and integration tests