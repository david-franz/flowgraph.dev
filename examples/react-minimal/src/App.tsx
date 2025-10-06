import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type {
  FlowGraphState,
  GraphConnection,
  GraphNode,
  GraphPort,
  FlowGraphNavigatorItem,
  FlowGraphNavigatorSection,
  PortAddress,
} from '@flowtomic/flowgraph';
import { FlowGraph, buildNavigatorSummary } from '@flowtomic/flowgraph';
import './App.css';

type GraphSnapshot = FlowGraphState;

const NODE_WIDTH = 220;
const NODE_HEIGHT = 150;

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

interface ViewportState {
  offsetX: number;
  offsetY: number;
  scale: number;
}

interface PanState {
  pointerId: number;
  originX: number;
  originY: number;
  startOffsetX: number;
  startOffsetY: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const App = (): JSX.Element => {
  const graph = useMemo(() => new FlowGraph(), []);
  const [snapshot, setSnapshot] = useState<GraphSnapshot>(() => graph.getState());
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [draft, setDraft] = useState<ConnectionDraft | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [theme, setTheme] = useState<string>('aurora');
  const [canvasWidth, setCanvasWidth] = useState(1000);
  const [canvasHeight, setCanvasHeight] = useState(620);
  const [showGrid, setShowGrid] = useState(true);
  const [animateConnections, setAnimateConnections] = useState(true);
  const [showNavigator, setShowNavigator] = useState(true);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ViewportState>({ offsetX: 0, offsetY: 0, scale: 1 });

  const panRef = useRef<PanState | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const portElements = useRef<Map<string, HTMLDivElement | null>>(new Map());

  useEffect(() => {
    ensureDemoGraph(graph);
    setSnapshot(graph.getState());
    return graph.subscribe(event => setSnapshot(event.state));
  }, [graph]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (selectedConnectionId && !snapshot.connections.some(connection => connection.id === selectedConnectionId)) {
      setSelectedConnectionId(null);
    }
  }, [snapshot.connections, selectedConnectionId]);

  useEffect(() => {
    if (focusedNodeId && !snapshot.nodes.some(node => node.id === focusedNodeId)) {
      setFocusedNodeId(null);
    }
  }, [focusedNodeId, snapshot.nodes]);

  useEffect(() => {
    graph.setViewport({
      position: {
        x: -viewport.offsetX / viewport.scale,
        y: -viewport.offsetY / viewport.scale,
      },
      zoom: viewport.scale,
    });
  }, [graph, viewport]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDraft(null);
        setDragging(null);
        setFocusedNodeId(null);
        setSelectedConnectionId(null);
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedConnectionId) {
        event.preventDefault();
        deleteConnection(selectedConnectionId);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedConnectionId]);

  const getPortKey = (address: PortAddress) => `${address.nodeId}:${address.portId}`;

  const setPortRef = (address: PortAddress, element: HTMLDivElement | null) => {
    const key = getPortKey(address);
    if (element) {
      portElements.current.set(key, element);
    } else {
      portElements.current.delete(key);
    }
  };

  const screenToWorld = useCallback(
    (screenX: number, screenY: number) => ({
      x: (screenX - viewport.offsetX) / viewport.scale,
      y: (screenY - viewport.offsetY) / viewport.scale,
    }),
    [viewport],
  );

  const clientToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) {
        return { x: 0, y: 0 };
      }
      return screenToWorld(clientX - canvasRect.left, clientY - canvasRect.top);
    },
    [screenToWorld],
  );

  const getPortCenter = useCallback(
    (address: PortAddress) => {
      const element = portElements.current.get(getPortKey(address));
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!element || !canvasRect) return null;
      const rect = element.getBoundingClientRect();
      return screenToWorld(rect.left - canvasRect.left, rect.top - canvasRect.top);
    },
    [screenToWorld],
  );

  const nudgeNode = useCallback(
    (id: string) => {
      const node = graph.getNode(id);
      if (!node) return;
      const dx = Math.round((Math.random() - 0.5) * 140);
      const dy = Math.round((Math.random() - 0.5) * 90);
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
    setSelectedConnectionId(null);
    setFocusedNodeId(null);
  }, [graph]);

  useEffect(() => {
    if (!dragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragging.pointerId) return;
      const world = clientToWorld(event.clientX, event.clientY);
      graph.moveNode(dragging.id, {
        x: Math.round(Math.max(0, world.x - dragging.offsetX)),
        y: Math.round(Math.max(0, world.y - dragging.offsetY)),
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
  }, [clientToWorld, dragging, graph]);

  useEffect(() => {
    if (!draft) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== draft.pointerId) return;
      const world = clientToWorld(event.clientX, event.clientY);
      setDraft(prev => (prev && prev.pointerId === event.pointerId ? { ...prev, currentPoint: world } : prev));
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== draft.pointerId) return;
      setDraft(prev => {
        if (prev && prev.hoverTarget) {
          try {
            const connection = graph.addConnection({ source: prev.source, target: prev.hoverTarget });
            setSelectedConnectionId(connection.id);
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
  }, [clientToWorld, draft, graph]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const pan = panRef.current;
      if (!pan || event.pointerId !== pan.pointerId) return;
      const deltaX = event.clientX - pan.originX;
      const deltaY = event.clientY - pan.originY;
      setViewport(prev => ({
        offsetX: pan.startOffsetX + deltaX,
        offsetY: pan.startOffsetY + deltaY,
        scale: prev.scale,
      }));
    };

    const handlePointerUp = (event: PointerEvent) => {
      const pan = panRef.current;
      if (!pan || event.pointerId !== pan.pointerId) return;
      panRef.current = null;
      canvasRef.current?.releasePointerCapture(event.pointerId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    if (panRef.current) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    }

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [viewport.scale]);

  const startPan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    panRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      startOffsetX: viewport.offsetX,
      startOffsetY: viewport.offsetY,
    };
    canvasEl.setPointerCapture(event.pointerId);
  }, [viewport]);

  const handleNodePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, node: GraphNode) => {
      if ((event.target as HTMLElement).closest('[data-port-id]')) {
        return;
      }
      event.preventDefault();
      const world = clientToWorld(event.clientX, event.clientY);
      setDragging({
        id: node.id,
        pointerId: event.pointerId,
        offsetX: world.x - node.position.x,
        offsetY: world.y - node.position.y,
      });
      setSelectedConnectionId(null);
      setFocusedNodeId(node.id);
    },
    [clientToWorld],
  );

  const startDraft = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, node: GraphNode, port: GraphPort) => {
      if (port.direction !== 'output') return;
      event.preventDefault();
      event.stopPropagation();
      const address: PortAddress = { nodeId: node.id, portId: port.id };
      const origin = getPortCenter(address);
      const worldFallback = clientToWorld(event.clientX, event.clientY);
      setDraft({
        pointerId: event.pointerId,
        source: address,
        currentPoint: origin ?? worldFallback,
        hoverTarget: null,
      });
      setSelectedConnectionId(null);
    },
    [clientToWorld, getPortCenter],
  );

  const handlePortEnter = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, node: GraphNode, port: GraphPort) => {
      if (!draft || port.direction !== 'input' || event.pointerId !== draft.pointerId) return;
      if (draft.source.nodeId === node.id && draft.source.portId === port.id) return;
      setDraft(prev => (prev ? { ...prev, hoverTarget: { nodeId: node.id, portId: port.id } } : prev));
    },
    [draft],
  );

  const handlePortLeave = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, port: GraphPort) => {
      if (!draft || port.direction !== 'input' || event.pointerId !== draft.pointerId) return;
      setDraft(prev => (prev ? { ...prev, hoverTarget: null } : prev));
    },
    [draft],
  );

  const getConnectionPath = useCallback(
    (connection: GraphConnection) => {
      const start = getPortCenter(connection.source);
      const end = getPortCenter(connection.target);
      if (!start || !end) {
        const sourceNode = snapshot.nodes.find(node => node.id === connection.source.nodeId);
        const targetNode = snapshot.nodes.find(node => node.id === connection.target.nodeId);
        if (!sourceNode || !targetNode) return '';
        const fallbackStart = { x: sourceNode.position.x + NODE_WIDTH - 16, y: sourceNode.position.y + NODE_HEIGHT / 2 };
        const fallbackEnd = { x: targetNode.position.x + 16, y: targetNode.position.y + NODE_HEIGHT / 2 };
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

  const deleteConnection = useCallback(
    (id: string) => {
      try {
        graph.removeConnection(id);
      } catch (err) {
        console.warn('Failed to remove connection', err);
      }
      setSelectedConnectionId(prev => (prev === id ? null : prev));
    },
    [graph],
  );

  const handleCanvasPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.target === canvasRef.current) {
        if (event.button === 1 || event.shiftKey) {
          event.preventDefault();
          startPan(event);
          return;
        }
        setSelectedConnectionId(null);
        setFocusedNodeId(null);
      }
    },
    [startPan],
  );

  const handleCanvasWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return;
      const pointerX = event.clientX - canvasRect.left;
      const pointerY = event.clientY - canvasRect.top;
      const scaleFactor = Math.exp(-event.deltaY * 0.0012);
      const nextScale = clamp(viewport.scale * scaleFactor, 0.4, 2.5);
      const worldX = (pointerX - viewport.offsetX) / viewport.scale;
      const worldY = (pointerY - viewport.offsetY) / viewport.scale;
      const nextOffsetX = pointerX - worldX * nextScale;
      const nextOffsetY = pointerY - worldY * nextScale;
      setViewport({ offsetX: nextOffsetX, offsetY: nextOffsetY, scale: nextScale });
    },
    [viewport],
  );

  const navigatorSummary = useMemo(() => buildNavigatorSummary(snapshot), [snapshot]);
  const stageStyle = useMemo(() => ({
    transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`,
    transformOrigin: '0 0',
  }), [viewport]);

  const handleNavigatorItemClick = useCallback(
    (section: FlowGraphNavigatorSection, item: FlowGraphNavigatorItem) => {
      if (section.kind === 'nodes') {
        setFocusedNodeId(item.id);
        setSelectedConnectionId(null);
      }
      if (section.kind === 'connections') {
        setSelectedConnectionId(item.id);
      }
    },
    [],
  );

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>FlowGraph minimal demo</h1>
        <p>Drag nodes, connect ports, experiment with themes, zoom, and pan.</p>

        <div className="control-group">
          <label>
            Theme
            <select className="control-select" value={theme} onChange={event => setTheme(event.target.value)}>
              {themes.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Canvas width
            <div className="control-row">
              <input
                type="range"
                min={720}
                max={1280}
                step={10}
                value={canvasWidth}
                onChange={event => setCanvasWidth(Number(event.target.value))}
              />
              <span>{canvasWidth}px</span>
            </div>
          </label>

          <label>
            Canvas height
            <div className="control-row">
              <input
                type="range"
                min={420}
                max={900}
                step={10}
                value={canvasHeight}
                onChange={event => setCanvasHeight(Number(event.target.value))}
              />
              <span>{canvasHeight}px</span>
            </div>
          </label>

          <div className="toggle-row">
            <span>Show grid</span>
            <input type="checkbox" checked={showGrid} onChange={event => setShowGrid(event.target.checked)} />
          </div>

          <div className="toggle-row">
            <span>Animate connections</span>
            <input type="checkbox" checked={animateConnections} onChange={event => setAnimateConnections(event.target.checked)} />
          </div>
        </div>

        <div className="settings-divider" />

        <div className="sidebar-controls control-group">
          <button onClick={reset}>Reset layout</button>
          {selectedConnectionId ? (
            <button onClick={() => deleteConnection(selectedConnectionId)}>Delete selected connection</button>
          ) : null}
          <button onClick={() => setShowNavigator(value => !value)}>{showNavigator ? 'Hide' : 'Show'} navigator</button>
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
                <button onClick={() => nudgeNode(node.id)}>Nudge</button>
              </li>
            ))}
          </ul>
        </div>

        <div className="settings-divider" />

        <section className="connections-panel">
          <h2>Connections</h2>
          <ul>
            {snapshot.connections.map(connection => (
              <li key={connection.id}>
                <span>
                  <code>{connection.source.nodeId}:{connection.source.portId}</code>
                  <span> → </span>
                  <code>{connection.target.nodeId}:{connection.target.portId}</code>
                </span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    className={selectedConnectionId === connection.id ? 'active' : ''}
                    onClick={() => setSelectedConnectionId(connection.id)}
                  >
                    Select
                  </button>
                  <button onClick={() => deleteConnection(connection.id)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </aside>

      <main className="canvas-wrapper" style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }}>
        <div
          className="canvas"
          ref={canvasRef}
          data-grid={showGrid ? 'on' : 'off'}
          onPointerDown={handleCanvasPointerDown}
          onWheel={handleCanvasWheel}
        >
          <button className="navigator-toggle" type="button" onClick={() => setShowNavigator(value => !value)}>
            {showNavigator ? 'Hide navigator' : 'Show navigator'}
          </button>

          <div className="canvas-stage" style={stageStyle}>
            <svg className="edges" width="100%" height="100%" viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}>
              <defs>
                <marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M2,2 L10,6 L2,10" fill="none" stroke="currentColor" strokeWidth="2" />
                </marker>
              </defs>
              {snapshot.connections.map(connection => {
                const path = getConnectionPath(connection);
                if (!path) return null;
                const classes = ['edge'];
                if (animateConnections) classes.push('edge--animated');
                if (selectedConnectionId === connection.id) classes.push('edge--selected');
                return (
                  <path
                    key={connection.id}
                    d={path}
                    className={classes.join(' ')}
                    markerEnd="url(#arrow)"
                    onPointerDown={event => {
                      event.preventDefault();
                      setSelectedConnectionId(connection.id);
                    }}
                    onDoubleClick={() => deleteConnection(connection.id)}
                  />
                );
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
                className={`node${dragging?.id === node.id ? ' dragging' : ''}${focusedNodeId === node.id ? ' focused' : ''}`}
                style={{ transform: `translate(${node.position.x}px, ${node.position.y}px)` }}
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
                      const active = isPortActive(node.id, port.id);
                      return (
                        <li key={port.id} className={`port port--${port.direction}${active ? ' port--active' : ''}`}>
                          {port.direction === 'input' && (
                            <div
                              className="port-handle"
                              data-port-id={port.id}
                              data-node-id={node.id}
                              data-port-direction={port.direction}
                              ref={element => setPortRef(address, element)}
                              onPointerEnter={event => handlePortEnter(event, node, port)}
                              onPointerLeave={event => handlePortLeave(event, port)}
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

          <aside className={`navigator-panel${showNavigator ? ' open' : ''}`}>
            <header>
              <strong>Navigator</strong>
              <span>
                {navigatorSummary.totals.nodes} nodes · {navigatorSummary.totals.connections} connections ·{' '}
                {navigatorSummary.totals.groups} groups
              </span>
            </header>
            <div className="navigator-sections">
              {navigatorSummary.sections.map(section => (
                <section key={section.id}>
                  <h3>{section.label}</h3>
                  <ul>
                    {section.items.map(item => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={
                            section.kind === 'connections'
                              ? selectedConnectionId === item.id
                                ? 'active'
                                : ''
                              : section.kind === 'nodes' && focusedNodeId === item.id
                                ? 'active'
                                : ''
                          }
                          onClick={() => handleNavigatorItemClick(section, item)}
                        >
                          <span className="primary">{item.label}</span>
                          {item.subtitle ? <span className="secondary">{item.subtitle}</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
};

const themes = [
  { id: 'aurora', label: 'Aurora (default)' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'dawn', label: 'Dawn' },
];

const ensureDemoGraph = (graph: FlowGraph): void => {
  if (graph.getState().nodes.length > 0) {
    return;
  }

  graph.importState({
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
};

export default App;