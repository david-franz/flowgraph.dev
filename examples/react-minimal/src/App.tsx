import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FlowGraphState, GraphNode } from '@flowtomic/flowgraph';
import { FlowGraphError } from '@flowtomic/flowgraph';
import { FlowCanvas, useFlowgraph, type FlowCanvasHandle } from '@flowtomic/flowgraph-react';
import type { FlowgraphRendererOptions, FlowgraphRendererSelection } from '@flowtomic/flowgraph-core-view';
import './App.css';

const createInitialState = (): FlowGraphState => ({
  nodes: [
    {
      id: 'start',
      label: 'Webhook Trigger',
      position: { x: 60, y: 180 },
      ports: [{ id: 'out', direction: 'output', label: 'next' }],
    },
    {
      id: 'decision',
      label: 'Route Payload',
      position: { x: 360, y: 140 },
      ports: [
        { id: 'in', direction: 'input', label: 'trigger', maxConnections: 1 },
        { id: 'success', direction: 'output', label: 'df++' },
        { id: 'error', direction: 'output', label: 'log', allowLoopback: true },
      ],
    },
    {
      id: 'dfpp',
      label: 'df++ Execution',
      position: { x: 660, y: 80 },
      ports: [
        { id: 'input', direction: 'input', label: 'payload', maxConnections: 1 },
        { id: 'done', direction: 'output', label: 'result' },
      ],
    },
    {
      id: 'log',
      label: 'Log Result',
      position: { x: 660, y: 280 },
      ports: [{ id: 'in', direction: 'input', label: 'entry', maxConnections: 4 }],
    },
  ],
  groups: [],
  connections: [
    {
      id: 'edge-1',
      source: { nodeId: 'start', portId: 'out' },
      target: { nodeId: 'decision', portId: 'in' },
    },
    {
      id: 'edge-2',
      source: { nodeId: 'decision', portId: 'success' },
      target: { nodeId: 'dfpp', portId: 'input' },
    },
    {
      id: 'edge-3',
      source: { nodeId: 'decision', portId: 'error' },
      target: { nodeId: 'log', portId: 'in' },
    },
    {
      id: 'edge-4',
      source: { nodeId: 'dfpp', portId: 'done' },
      target: { nodeId: 'log', portId: 'in' },
    },
  ],
});

const randomId = () => `node-${Math.random().toString(36).slice(2, 7)}`;

const App = (): JSX.Element => {
  const { graph, state } = useFlowgraph();
  const canvasRef = useRef<FlowCanvasHandle | null>(null);
  const [selection, setSelection] = useState<FlowgraphRendererSelection | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (graph.getState().nodes.length === 0) {
      graph.importState(createInitialState());
    }
  }, [graph]);

  const rendererOptions: FlowgraphRendererOptions = useMemo(
    () => ({
      onNodeSelect: node => {
        setSelection({ nodeId: node.id, connectionId: null });
        setError(null);
      },
      onConnectionSelect: connection => {
        setSelection({ nodeId: null, connectionId: connection.id });
        setError(null);
      },
      onConnectionCreate: connection => {
        setSelection({ nodeId: null, connectionId: connection.id });
        setError(null);
      },
      onConnectionError: err => {
        const message = err instanceof FlowGraphError ? err.message : String(err);
        setError(message);
      },
    }),
    [],
  );

  const focusNode = useCallback((nodeId: string) => {
    setSelection({ nodeId, connectionId: null });
    const renderer = canvasRef.current?.getRenderer();
    renderer?.focusNode(nodeId);
  }, []);

  const addUtilityNode = useCallback(() => {
    const id = randomId();
    graph.addNode({
      id,
      label: `Utility ${state.nodes.length + 1}`,
      position: { x: 240 + Math.random() * 320, y: 120 + Math.random() * 240 },
      ports: [
        { id: 'in', direction: 'input', label: 'input', maxConnections: 1 },
        { id: 'out', direction: 'output', label: 'output' },
      ],
    });
    setSelection({ nodeId: id, connectionId: null });
    setError(null);
  }, [graph, state.nodes.length]);

  const removeSelected = useCallback(() => {
    if (selection?.connectionId) {
      try {
        graph.removeConnection(selection.connectionId);
        setSelection({ nodeId: null, connectionId: null });
      } catch (err) {
        setError(err instanceof FlowGraphError ? err.message : String(err));
      }
      return;
    }

    if (selection?.nodeId) {
      try {
        graph.removeNode(selection.nodeId);
        setSelection({ nodeId: null, connectionId: null });
      } catch (err) {
        setError(err instanceof FlowGraphError ? err.message : String(err));
      }
    }
  }, [graph, selection]);

  const resetGraph = useCallback(() => {
    graph.importState(createInitialState());
    setSelection({ nodeId: 'start', connectionId: null });
    setError(null);
    setTimeout(() => focusNode('start'), 0);
  }, [graph, focusNode]);

  const selectionLabel = useMemo(() => {
    if (selection?.nodeId) {
      const node = state.nodes.find(candidate => candidate.id === selection.nodeId);
      return node ? `Node: ${node.label}` : `Node: ${selection.nodeId}`;
    }
    if (selection?.connectionId) {
      const connection = state.connections.find(candidate => candidate.id === selection.connectionId);
      if (!connection) return `Connection: ${selection.connectionId}`;
      return `Connection: ${connection.source.nodeId}:${connection.source.portId} → ${connection.target.nodeId}:${connection.target.portId}`;
    }
    return 'Nothing selected';
  }, [selection, state.connections, state.nodes]);

  const handleSidebarSelect = useCallback(
    (node: GraphNode) => {
      setSelection({ nodeId: node.id, connectionId: null });
      focusNode(node.id);
    },
    [focusNode],
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <header>
          <h1>Flowgraph minimal demo</h1>
          <p>Create nodes, drag them around, and draft connections directly on the canvas.</p>
        </header>

        <section className="controls">
          <button type="button" onClick={addUtilityNode}>
            Add utility node
          </button>
          <button type="button" onClick={resetGraph}>
            Reset graph
          </button>
          <button type="button" onClick={removeSelected} disabled={!selection?.nodeId && !selection?.connectionId}>
            Delete selection
          </button>
        </section>

        <section className="status">
          <h2>Status</h2>
          <dl>
            <div>
              <dt>Nodes</dt>
              <dd>{state.nodes.length}</dd>
            </div>
            <div>
              <dt>Connections</dt>
              <dd>{state.connections.length}</dd>
            </div>
          </dl>
          <p className="selection">{selectionLabel}</p>
          {error ? <p className="error">{error}</p> : null}
          <p className="tip">
            Tip: Drag the canvas from empty space to pan, drag nodes to reposition, double-click a connection to
            delete it, and press <kbd>Delete</kbd> to remove the current selection.
          </p>
        </section>

        <section className="sidebar-list">
          <h2>Nodes</h2>
          <ul>
            {state.nodes.map(node => (
              <li key={node.id}>
                <button
                  type="button"
                  className={selection?.nodeId === node.id ? 'selected' : undefined}
                  onClick={() => handleSidebarSelect(node)}
                >
                  <span className="name">{node.label}</span>
                  <span className="meta">
                    ({Math.round(node.position.x)}, {Math.round(node.position.y)})
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </aside>

      <main className="canvas-panel">
        <FlowCanvas
          ref={canvasRef}
          graph={graph}
          rendererOptions={rendererOptions}
          selection={selection ?? undefined}
        />
      </main>
    </div>
  );
};

export default App;