import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { FlowGraphState, GraphConnection, GraphNode, GraphPort, PortAddress } from '@flowtomic/flowgraph';
import { FlowGraph } from '@flowtomic/flowgraph';
import './App.css';

type GraphSnapshot = FlowGraphState;

const NODE_WIDTH = 180;
const NODE_HEIGHT = 120;

const ensureDemoGraph = (graph: FlowGraph): void => {
  if (graph.getState().nodes.length > 0) {
    return;
  }

  graph.importState({
    nodes: [
      {
        id: 'start',
        label: 'Webhook Trigger',
        position: { x: 60, y: 160 },
        ports: [{ id: 'out', direction: 'output', label: 'next' }],
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
          { id: 'input', direction: 'input', label: 'payload', maxConnections: 1 },
          { id: 'done', direction: 'output', label: 'result' },
        ],
      },
      {
        id: 'log',
        label: 'Log Result',
        position: { x: 580, y: 260 },
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
};

interface DragState {
  id: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

interface ConnectionDraft {
  pointerId: number;
  source: PortAddress;
  currentPoint: { x: number; y: number };
  hoverTarget: PortAddress | null;
}

const App = (): JSX.Element => {
  const graph = useMemo(() => new FlowGraph(), []);
  const [snapshot, setSnapshot] = useState<GraphSnapshot>(() => graph.getState());
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [draft, setDraft] = useState<ConnectionDraft | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const portElements = useRef<Map<string, HTMLDivElement | null>>(new Map());

  useEffect(() => {
    ensureDemoGraph(graph);
    setSnapshot(graph.getState());
    return graph.subscribe(event => setSnapshot(event.state));
  }, [graph]);

  const getPortKey = (address: PortAddress): string => `${address.nodeId}:${address.portId}`;

  const setPortRef = (address: PortAddress, element: HTMLDivElement | null) => {
    const key = getPortKey(address);
    if (element) {
      portElements.current.set(key, element);
    } else {
      portElements.current.delete(key);
    }
  };

  const getPortCenter = useCallback(
    (address: PortAddress) => {
      const element = portElements.current.get(getPortKey(address));
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!element || !canvasRect) return null;
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left - canvasRect.left + rect.width / 2,
        y: rect.top - canvasRect.top + rect.height / 2,
      };
    },
    [],
  );

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

  useEffect(() => {
    if (!draft) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== draft.pointerId) return;
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return;

      setDraft(prev =>
        prev && prev.pointerId === event.pointerId
          ? {
              ...prev,
              currentPoint: {
                x: event.clientX - canvasRect.left,
                y: event.clientY - canvasRect.top,
              },
            }
          : prev,
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== draft.pointerId) return;
      setDraft(prev => {
        if (!prev) return null;
        if (prev.hoverTarget) {
          try {
            graph.addConnection({ source: prev.source, target: prev.hoverTarget });
          } catch (err) {
            console.warn('Failed to add connection', err);
          }
        }
        return null;
      });
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draft, graph]);

  const handleNodePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, node: GraphNode) => {
      if ((event.target as HTMLElement).closest('[data-port-id]')) {
        return;
      }
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

  const startDraft = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, node: GraphNode, port: GraphPort) => {
      if (port.direction !== 'output') return;
      event.preventDefault();
      event.stopPropagation();
      const address: PortAddress = { nodeId: node.id, portId: port.id };
      const origin = getPortCenter(address);
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      setDraft({
        pointerId: event.pointerId,
        source: address,
        currentPoint: origin ?? {
          x: canvasRect ? event.clientX - canvasRect.left : 0,
          y: canvasRect ? event.clientY - canvasRect.top : 0,
        },
        hoverTarget: null,
      });
    },
    [getPortCenter],
  );

  const handlePortEnter = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, node: GraphNode, port: GraphPort) => {
      if (!draft || port.direction !== 'input' || event.pointerId !== draft.pointerId) return;
      setDraft(prev => (prev ? { ...prev, hoverTarget: { nodeId: node.id, portId: port.id } } : prev));
    },
    [draft],
  );

  const handlePortLeave = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, node: GraphNode, port: GraphPort) => {
      if (!draft || port.direction !== 'input' || event.pointerId !== draft.pointerId) return;
      setDraft(prev => (prev ? { ...prev, hoverTarget: null } : prev));
    },
    [draft],
  );

  const getConnectionPath = useCallback(
    (connection: GraphConnection): string => {
      const start = getPortCenter(connection.source);
      const end = getPortCenter(connection.target);

      if (!start || !end) {
        const sourceNode = snapshot.nodes.find(n => n.id === connection.source.nodeId);
        const targetNode = snapshot.nodes.find(n => n.id === connection.target.nodeId);
        if (!sourceNode || !targetNode) return '';
        const fallbackStart = {
          x: sourceNode.position.x + (NODE_WIDTH - 16),
          y: sourceNode.position.y + NODE_HEIGHT / 2,
        };
        const fallbackEnd = {
          x: targetNode.position.x + 16,
          y: targetNode.position.y + NODE_HEIGHT / 2,
        };
        const controlOffset = Math.max(80, Math.abs(fallbackEnd.x - fallbackStart.x) / 2);
        return `M ${fallbackStart.x} ${fallbackStart.y} C ${fallbackStart.x + controlOffset} ${fallbackStart.y}, ${fallbackEnd.x - controlOffset} ${fallbackEnd.y}, ${fallbackEnd.x} ${fallbackEnd.y}`;
      }

      const controlOffset = Math.max(80, Math.abs(end.x - start.x) / 2);
      return `M ${start.x} ${start.y} C ${start.x + controlOffset} ${start.y}, ${end.x - controlOffset} ${end.y}, ${end.x} ${end.y}`;
    },
    [getPortCenter, snapshot.nodes],
  );

  const isPortActive = useCallback(
    (nodeId: string, portId: string) => {
      if (!draft) return false;
      const key = getPortKey({ nodeId, portId });
      return (
        key === getPortKey(draft.source) ||
        (draft.hoverTarget ? key === getPortKey(draft.hoverTarget) : false)
      );
    },
    [draft],
  );

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>FlowGraph minimal demo</h1>
        <p>
          Drag nodes, connect ports, and observe state updates from <code>@flowtomic/flowgraph</code>.
        </p>
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
              const path = getConnectionPath(connection);
              if (!path) return null;
              return <path key={connection.id} d={path} className="edge" markerEnd="url(#arrow)" />;
            })}
            {draft
              ? (() => {
                  const start = getPortCenter(draft.source);
                  if (!start) return null;
                  const controlOffset = Math.max(80, Math.abs(draft.currentPoint.x - start.x) / 2);
                  const path = `M ${start.x} ${start.y} C ${start.x + controlOffset} ${start.y}, ${draft.currentPoint.x - controlOffset} ${draft.currentPoint.y}, ${draft.currentPoint.x} ${draft.currentPoint.y}`;
                  return <path d={path} className="edge edge--draft" markerEnd="url(#arrow)" />;
                })()
              : null}
          </svg>

          {snapshot.nodes.map(node => (
            <div
              key={node.id}
              className={`node${dragging?.id === node.id ? ' dragging' : ''}`}
              style={{
                transform: `translate(${node.position.x}px, ${node.position.y}px)`
              }}
              onPointerDown={event => handleNodePointerDown(event, node)}
            >
              <header>
                <span>{node.label}</span>
              </header>
              <section>
                <h3>Ports</h3>
                <ul className="ports">
                  {node.ports.map(port => {
                    const address = { nodeId: node.id, portId: port.id } as const;
                    const isActive = isPortActive(node.id, port.id);
                    return (
                      <li
                        key={port.id}
                        className={`port port--${port.direction}${isActive ? ' port--active' : ''}`}
                      >
                        {port.direction === 'input' && (
                          <div
                            className="port-handle"
                            data-port-id={port.id}
                            data-node-id={node.id}
                            data-port-direction={port.direction}
                            ref={element => setPortRef(address, element)}
                            onPointerEnter={event => handlePortEnter(event, node, port)}
                            onPointerLeave={event => handlePortLeave(event, node, port)}
                          />
                        )}
                        <div className="port-label">
                          <code>{port.id}</code>
                          <span>{port.label ?? port.direction}</span>
                        </div>
                        {port.direction === 'output' && (
                          <div
                            className="port-handle"
                            data-port-id={port.id}
                            data-node-id={node.id}
                            data-port-direction={port.direction}
                            ref={element => setPortRef(address, element)}
                            onPointerDown={event => startDraft(event, node, port)}
                          />
                        )}
                      </li>
                    );
                  })}
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