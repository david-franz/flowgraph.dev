import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { FlowGraphState, GraphConnection, GraphNode } from '@flowtomic/flowgraph';
import { FlowGraph } from '@flowtomic/flowgraph';
import './App.css';

type GraphSnapshot = FlowGraphState;

const NODE_WIDTH = 180;
const NODE_HEIGHT = 100;

const ensureDemoGraph = (graph: FlowGraph): void => {
  const state = graph.getState();
  if (state.nodes.length > 0) {
    return;
  }

  graph.importState({
    nodes: [
      {
        id: 'start',
        label: 'Webhook Trigger',
        position: { x: 60, y: 160 },
        ports: [
          { id: 'out', direction: 'output', label: 'next' },
        ],
      },
      {
        id: 'decision',
        label: 'Route Payload',
        position: { x: 320, y: 120 },
        ports: [
          { id: 'in', direction: 'input', label: 'trigger', maxConnections: 1 },
          { id: 'success', direction: 'output', label: 'df++' },
          { id: 'error', direction: 'output', label: 'log', allowLoopback: true },
        ],
      },
      {
        id: 'dfpp',
        label: 'df++ Execution',
        position: { x: 580, y: 60 },
        ports: [
          { id: 'in', direction: 'input', label: 'payload', maxConnections: 1 },
          { id: 'out', direction: 'output', label: 'result' },
        ],
      },
      {
        id: 'log',
        label: 'Log Result',
        position: { x: 580, y: 220 },
        ports: [
          { id: 'in', direction: 'input', label: 'entry', maxConnections: 4 },
        ],
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
        target: { nodeId: 'dfpp', portId: 'in' },
      },
      {
        id: 'edge-3',
        source: { nodeId: 'decision', portId: 'error' },
        target: { nodeId: 'log', portId: 'in' },
        path: [
          { x: 320, y: 260 },
          { x: 520, y: 260 },
          { x: 520, y: 260 },
        ],
      },
      {
        id: 'edge-4',
        source: { nodeId: 'dfpp', portId: 'out' },
        target: { nodeId: 'log', portId: 'in' },
      },
    ],
  });
};

const getConnectionPath = (connection: GraphConnection, nodes: GraphNode[]): string => {
  const source = nodes.find(n => n.id === connection.source.nodeId);
  const target = nodes.find(n => n.id === connection.target.nodeId);
  if (!source || !target) {
    return '';
  }

  const start = {
    x: source.position.x + NODE_WIDTH,
    y: source.position.y + NODE_HEIGHT / 2,
  };
  const end = {
    x: target.position.x,
    y: target.position.y + NODE_HEIGHT / 2,
  };

  const controlOffset = Math.max(80, Math.abs(end.x - start.x) / 2);
  const path = `M ${start.x} ${start.y} C ${start.x + controlOffset} ${start.y}, ${end.x - controlOffset} ${end.y}, ${end.x} ${end.y}`;
  return path;
};

interface DragState {
  id: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

const App = (): JSX.Element => {
  const graph = useMemo(() => new FlowGraph(), []);
  const [snapshot, setSnapshot] = useState<GraphSnapshot>(() => graph.getState());
  const [dragging, setDragging] = useState<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    ensureDemoGraph(graph);
    setSnapshot(graph.getState());
    return graph.subscribe(event => setSnapshot(event.state));
  }, [graph]);

  const nudgeNode = useCallback(
    (id: string) => {
      const node = graph.getNode(id);
      if (!node) return;
      const dx = Math.round((Math.random() - 0.5) * 120);
      const dy = Math.round((Math.random() - 0.5) * 80);
      graph.moveNode(id, {
        x: Math.max(20, node.position.x + dx),
        y: Math.max(20, node.position.y + dy),
      });
    },
    [graph],
  );

  const reset = useCallback(() => {
    graph.importState({ nodes: [], connections: [], groups: [] });
    ensureDemoGraph(graph);
  }, [graph]);

  useEffect(() => {
    if (!dragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragging.pointerId) return;
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return;

      const x = event.clientX - canvasRect.left - dragging.offsetX;
      const y = event.clientY - canvasRect.top - dragging.offsetY;
      graph.moveNode(dragging.id, {
        x: Math.round(Math.max(0, x)),
        y: Math.round(Math.max(0, y)),
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== dragging.pointerId) return;
      setDragging(null);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragging, graph]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, node: GraphNode) => {
      event.preventDefault();
      const nodeRect = event.currentTarget.getBoundingClientRect();
      const offsetX = event.clientX - nodeRect.left;
      const offsetY = event.clientY - nodeRect.top;
      setDragging({
        id: node.id,
        pointerId: event.pointerId,
        offsetX,
        offsetY,
      });
    },
    [],
  );

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>FlowGraph minimal demo</h1>
        <p>Nodes from <code>@flowtomic/flowgraph</code> rendered as simple cards with bezier connection paths.</p>
        <div className="sidebar-controls">
          <button onClick={reset}>Reset layout</button>
        </div>
        <div className="sidebar-list">
          <h2>Nodes</h2>
          <ul>
            {snapshot.nodes.map(node => (
              <li key={node.id}>
                <div>
                  <strong>{node.label}</strong>
                  <div className="coords">
                    ({Math.round(node.position.x)}, {Math.round(node.position.y)})
                  </div>
                </div>
                <button onClick={() => nudgeNode(node.id)}>Move</button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="canvas-wrapper">
        <div className="canvas" ref={canvasRef}>
          <svg className="edges" width="100%" height="100%">
            <defs>
              <marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M2,2 L10,6 L2,10" fill="none" stroke="#38bdf8" strokeWidth="2" />
              </marker>
            </defs>
            {snapshot.connections.map(connection => {
              const path = getConnectionPath(connection, snapshot.nodes);
              if (!path) return null;
              return <path key={connection.id} d={path} className="edge" markerEnd="url(#arrow)" />;
            })}
          </svg>

          {snapshot.nodes.map(node => (
            <div
              key={node.id}
              className={`node${dragging?.id === node.id ? ' dragging' : ''}`}
              style={{
                transform: `translate(${node.position.x}px, ${node.position.y}px)`
              }}
              onPointerDown={event => handlePointerDown(event, node)}
            >
              <header>
                <span>{node.label}</span>
              </header>
              <section>
                <h3>Ports</h3>
                <ul>
                  {node.ports.map(port => (
                    <li key={port.id}>
                      <code>{port.id}</code>
                      <span>{port.direction}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default App;