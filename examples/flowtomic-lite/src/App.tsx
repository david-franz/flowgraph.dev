import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react';
import type {
  FlowGraphState,
  FlowGraphNavigatorItem,
  FlowGraphNavigatorSection,
  GraphConnection,
  GraphNode,
  GraphPort,
  NodeFormField,
  NodeFormSchema,
  PortAddress,
} from '@flowtomic/flowgraph';
import { FlowGraph, buildNavigatorSummary } from '@flowtomic/flowgraph';

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

interface NodeTemplate {
  id: string;
  label: string;
  description: string;
  form?: NodeFormSchema;
  ports: GraphPort[];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const nodeTemplates: NodeTemplate[] = [
  {
    id: 'script-task',
    label: 'Script Task',
    description: 'Execute a df++ snippet with custom variables.',
    ports: [
      { id: 'in', direction: 'input', label: 'trigger', maxConnections: 1 },
      { id: 'success', direction: 'output', label: 'success' },
      { id: 'error', direction: 'output', label: 'error', allowLoopback: true },
    ],
    form: {
      sections: [
        {
          id: 'script-config',
          title: 'Script configuration',
          fields: [
            { id: 'name', label: 'Step name', kind: 'text', required: true },
            { id: 'language', label: 'Language', kind: 'select', options: [
              { value: 'dfpp', label: 'df++' },
              { value: 'js', label: 'JavaScript' },
            ], defaultValue: 'dfpp' },
            { id: 'code', label: 'Script body', kind: 'textarea', defaultValue: '// df++ code here' },
          ],
        },
      ],
    },
  },
  {
    id: 'http-call',
    label: 'HTTP Call',
    description: 'Fetch external data and emit results.',
    ports: [
      { id: 'in', direction: 'input', label: 'trigger', maxConnections: 1 },
      { id: 'success', direction: 'output', label: '200 OK' },
      { id: 'failure', direction: 'output', label: 'non-200' },
    ],
    form: {
      sections: [
        {
          id: 'http-config',
          title: 'HTTP request',
          fields: [
            { id: 'method', label: 'Method', kind: 'select', options: [
              { value: 'GET', label: 'GET' },
              { value: 'POST', label: 'POST' },
              { value: 'PUT', label: 'PUT' },
            ], defaultValue: 'GET' },
            { id: 'url', label: 'URL', kind: 'text', placeholder: 'https://api.example.com' },
            { id: 'body', label: 'Body', kind: 'textarea', description: 'Optional JSON body' },
          ],
        },
      ],
    },
  },
  {
    id: 'decision-node',
    label: 'Decision Split',
    description: 'Evaluate conditions and branch into multiple paths.',
    ports: [
      { id: 'in', direction: 'input', label: 'trigger', maxConnections: 1 },
      { id: 'yes', direction: 'output', label: 'yes' },
      { id: 'no', direction: 'output', label: 'no' },
    ],
    form: {
      sections: [
        {
          id: 'decision-rules',
          title: 'Decision rules',
          fields: [
            { id: 'expression', label: 'Expression', kind: 'textarea', defaultValue: 'payload.value > 10' },
            { id: 'timeout', label: 'Timeout (ms)', kind: 'number', defaultValue: 5000 },
          ],
        },
      ],
    },
  },
];

const createNodeFromTemplate = (template: NodeTemplate): GraphNode => ({
  id: `${template.id}-${crypto.randomUUID().slice(0, 5)}`,
  label: template.label,
  position: { x: 80 + Math.random() * 400, y: 80 + Math.random() * 280 },
  ports: template.ports.map(port => ({ ...port })),
  data: {},
  form: template.form,
});

const App = (): JSX.Element => {
  const graph = useMemo(() => new FlowGraph(), []);
  const [snapshot, setSnapshot] = useState<GraphSnapshot>(() => graph.getState());
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [draft, setDraft] = useState<ConnectionDraft | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [showNavigator, setShowNavigator] = useState(true);
  const [viewport, setViewport] = useState<ViewportState>({ offsetX: 0, offsetY: 0, scale: 1 });

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const portElements = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const panRef = useRef<PanState | null>(null);

  useEffect(() => {
    if (graph.getState().nodes.length === 0) {
      nodeTemplates.forEach(template => graph.addNode(createNodeFromTemplate(template)));
    }
    setSnapshot(graph.getState());
    return graph.subscribe(event => setSnapshot(event.state));
  }, [graph]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDraft(null);
        setDragging(null);
        setSelectedConnectionId(null);
        setSelectedNodeId(null);
        setFocusedNodeId(null);
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedConnectionId) {
        event.preventDefault();
        deleteConnection(selectedConnectionId);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedConnectionId]);

  useEffect(() => {
    if (selectedNodeId && !snapshot.nodes.some(node => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [selectedNodeId, snapshot.nodes]);

  useEffect(() => {
    if (selectedConnectionId && !snapshot.connections.some(connection => connection.id === selectedConnectionId)) {
      setSelectedConnectionId(null);
    }
  }, [selectedConnectionId, snapshot.connections]);

  useEffect(() => {
    graph.setViewport({
      position: {
        x: -viewport.offsetX / viewport.scale,
        y: -viewport.offsetY / viewport.scale,
      },
      zoom: viewport.scale,
    });
  }, [graph, viewport]);

  const getPortKey = (address: PortAddress) => `${address.nodeId}:${address.portId}`;

  const setPortRef = (address: PortAddress, element: HTMLDivElement | null) => {
    const key = getPortKey(address);
    if (element) portElements.current.set(key, element);
    else portElements.current.delete(key);
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
      if (!canvasRect) return { x: 0, y: 0 };
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

  const addNodeFromTemplate = useCallback(
    (template: NodeTemplate) => {
      const created = graph.addNode(createNodeFromTemplate(template));
      setSelectedNodeId(created.id);
      setFocusedNodeId(created.id);
    },
    [graph],
  );

  const duplicateNode = useCallback(
    (node: GraphNode) => {
      const clone = {
        ...node,
        id: `${node.id}-copy-${crypto.randomUUID().slice(0, 4)}`,
        position: { x: node.position.x + 32, y: node.position.y + 32 },
      };
      const created = graph.addNode(clone);
      setSelectedNodeId(created.id);
      setFocusedNodeId(created.id);
    },
    [graph],
  );

  const deleteNode = useCallback(
    (id: string) => {
      try {
        graph.removeNode(id);
      } catch (err) {
        console.warn('Failed to remove node', err);
      }
      setSelectedNodeId(prev => (prev === id ? null : prev));
      setFocusedNodeId(prev => (prev === id ? null : prev));
    },
    [graph],
  );

  const updateNodeData = useCallback(
    (node: GraphNode, field: NodeFormField, value: unknown) => {
      const current = node.data ?? {};
      const next = { ...current, [field.id]: value };
      graph.setNodeData(node.id, next);
    },
    [graph],
  );

  const changeNodeLabel = useCallback(
    (node: GraphNode, value: string) => {
      graph.updateNode(node.id, { label: value });
    },
    [graph],
  );

  const changeNodeGroup = useCallback(
    (node: GraphNode, groupId: string | null) => {
      graph.assignNodeToGroup(node.id, groupId);
    },
    [graph],
  );

  const selectedNode = useMemo(
    () => snapshot.nodes.find(node => node.id === selectedNodeId) ?? null,
    [selectedNodeId, snapshot.nodes],
  );

  const navigatorSummary = useMemo(() => buildNavigatorSummary(snapshot), [snapshot]);

  const centerOnNode = useCallback((node: GraphNode) => {
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const width = canvasRect?.width ?? window.innerWidth;
    const height = canvasRect?.height ?? window.innerHeight;
    setViewport(prev => ({
      scale: prev.scale,
      offsetX: width / 2 - (node.position.x + NODE_WIDTH / 2) * prev.scale,
      offsetY: height / 2 - (node.position.y + NODE_HEIGHT / 2) * prev.scale,
    }));
  }, []);

  const handleNodePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, node: GraphNode) => {
      if ((event.target as HTMLElement).closest('[data-port-id]')) return;
      event.preventDefault();
      const world = clientToWorld(event.clientX, event.clientY);
      setDragging({
        id: node.id,
        pointerId: event.pointerId,
        offsetX: world.x - node.position.x,
        offsetY: world.y - node.position.y,
      });
      setSelectedNodeId(node.id);
      setFocusedNodeId(node.id);
      setSelectedConnectionId(null);
    },
    [clientToWorld],
  );

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

  const startDraft = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, node: GraphNode, port: GraphPort) => {
      if (port.direction !== 'output') return;
      event.preventDefault();
      event.stopPropagation();
      const address: PortAddress = { nodeId: node.id, portId: port.id };
      const origin = getPortCenter(address);
      const fallback = clientToWorld(event.clientX, event.clientY);
      setDraft({
        pointerId: event.pointerId,
        source: address,
        currentPoint: origin ?? fallback,
        hoverTarget: null,
      });
      setSelectedConnectionId(null);
    },
    [clientToWorld, getPortCenter],
  );

  const handlePortEnter = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, node: GraphNode, port: GraphPort) => {
      if (!draft || port.direction !== 'input' || event.pointerId !== draft.pointerId) return;
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

  useEffect(() => {
    if (!draft) return;
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== draft.pointerId) return;
      setDraft(prev =>
        prev && prev.pointerId === event.pointerId
          ? {
              ...prev,
              currentPoint: clientToWorld(event.clientX, event.clientY),
            }
          : prev,
      );
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
        scale: prev.scale,
        offsetX: pan.startOffsetX + deltaX,
        offsetY: pan.startOffsetY + deltaY,
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
          return;
        }
        setSelectedConnectionId(null);
        setSelectedNodeId(null);
        setFocusedNodeId(null);
      }
    },
    [viewport.offsetX, viewport.offsetY],
  );

  const handleCanvasWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return;
      const pointerX = event.clientX - canvasRect.left;
      const pointerY = event.clientY - canvasRect.top;
      const scaleFactor = Math.exp(-event.deltaY * 0.0012);
      const nextScale = clamp(viewport.scale * scaleFactor, 0.45, 2.3);
      const worldX = (pointerX - viewport.offsetX) / viewport.scale;
      const worldY = (pointerY - viewport.offsetY) / viewport.scale;
      const nextOffsetX = pointerX - worldX * nextScale;
      const nextOffsetY = pointerY - worldY * nextScale;
      setViewport({ offsetX: nextOffsetX, offsetY: nextOffsetY, scale: nextScale });
    },
    [viewport],
  );

  const handleNavigatorItemClick = useCallback(
    (section: FlowGraphNavigatorSection, item: FlowGraphNavigatorItem) => {
      if (section.kind === 'nodes') {
        setSelectedNodeId(item.id);
        setFocusedNodeId(item.id);
        setSelectedConnectionId(null);
        const node = snapshot.nodes.find(n => n.id === item.id);
        if (node) centerOnNode(node);
      }
      if (section.kind === 'connections') {
        setSelectedConnectionId(item.id);
      }
    },
    [centerOnNode, snapshot.nodes],
  );

  const handleFieldChange = useCallback(
    (node: GraphNode, field: NodeFormField, event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      let value: unknown = event.target.value;
      if (field.kind === 'checkbox') value = event.target.checked;
      if (field.kind === 'number') value = Number(value);
      updateNodeData(node, field, value);
    },
    [updateNodeData],
  );

  return (
    <div className="app-shell">
      <aside className="palette">
        <h1>Flowtomic Lite</h1>
        <p className="palette-description">Blueprint of Flowtomic interactions using <code>@flowtomic/flowgraph</code>.</p>

        <section>
          <h2>Node templates</h2>
          <ul>
            {nodeTemplates.map(template => (
              <li key={template.id}>
                <div>
                  <strong>{template.label}</strong>
                  <p>{template.description}</p>
                </div>
                <div className="palette-actions">
                  <button type="button" onClick={() => addNodeFromTemplate(template)}>
                    Add to canvas
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="navigator-summary">
          <header>
            <span>Navigator</span>
            <button type="button" onClick={() => setShowNavigator(value => !value)}>
              {showNavigator ? 'Hide' : 'Show'} panel
            </button>
          </header>
          <div className="totals">
            <div>
              <strong>{navigatorSummary.totals.nodes}</strong>
              <span>Nodes</span>
            </div>
            <div>
              <strong>{navigatorSummary.totals.connections}</strong>
              <span>Connections</span>
            </div>
            <div>
              <strong>{navigatorSummary.totals.groups}</strong>
              <span>Groups</span>
            </div>
          </div>
        </section>
      </aside>

      <main className="workspace">
        <div className="canvas-container">
          <div
            className="canvas"
            ref={canvasRef}
            onPointerDown={handleCanvasPointerDown}
            onWheel={handleCanvasWheel}
          >
            <div
              className="canvas-stage"
              style={{ transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`, transformOrigin: '0 0' }}
            >
              <svg className="edges" width="100%" height="100%" viewBox="0 0 2200 1400">
                <defs>
                  <marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M2,2 L10,6 L2,10" fill="none" stroke="currentColor" strokeWidth="2" />
                  </marker>
                </defs>
                {snapshot.connections.map(connection => {
                  const path = getConnectionPath(connection);
                  if (!path) return null;
                  const isSelected = selectedConnectionId === connection.id;
                  return (
                    <path
                      key={connection.id}
                      d={path}
                      className={`edge${isSelected ? ' edge--selected' : ''}`}
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
                  onDoubleClick={() => centerOnNode(node)}
                >
                  <header>
                    <span>{node.label}</span>
                    <button type="button" onClick={() => duplicateNode(node)}>Duplicate</button>
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
                              section.kind === 'nodes'
                                ? selectedNodeId === item.id
                                  ? 'active'
                                  : ''
                                : section.kind === 'connections' && selectedConnectionId === item.id
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
        </div>

        <aside className="inspector">
          <header>
            <h2>Inspector</h2>
            {selectedNode ? (
              <button type="button" onClick={() => deleteNode(selectedNode.id)}>
                Delete node
              </button>
            ) : null}
          </header>

          {selectedNode ? (
            <div className="inspector-content">
              <label>
                Node label
                <input
                  type="text"
                  value={selectedNode.label}
                  onChange={event => changeNodeLabel(selectedNode, event.target.value)}
                />
              </label>

              <label>
                Group id
                <input
                  type="text"
                  value={selectedNode.groupId ?? ''}
                  placeholder="Optional group"
                  onChange={event => changeNodeGroup(selectedNode, event.target.value || null)}
                />
              </label>

              {selectedNode.form ? (
                <section className="form-section">
                  {selectedNode.form.sections.map(section => (
                    <fieldset key={section.id}>
                      <legend>{section.title}</legend>
                      {section.fields.map(field => {
                        const value = (selectedNode.data ?? {})[field.id] ?? '';
                        if (field.kind === 'select') {
                          return (
                            <label key={field.id}>
                              {field.label}
                              <select value={String(value)} onChange={event => handleFieldChange(selectedNode, field, event)}>
                                {(field.options ?? []).map(option => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          );
                        }
                        if (field.kind === 'textarea' || field.kind === 'code') {
                          return (
                            <label key={field.id}>
                              {field.label}
                              <textarea
                                rows={field.kind === 'code' ? 8 : 4}
                                value={String(value)}
                                onChange={event => handleFieldChange(selectedNode, field, event)}
                              />
                            </label>
                          );
                        }
                        if (field.kind === 'number') {
                          return (
                            <label key={field.id}>
                              {field.label}
                              <input
                                type="number"
                                value={value === '' ? '' : Number(value)}
                                onChange={event => handleFieldChange(selectedNode, field, event)}
                              />
                            </label>
                          );
                        }
                        if (field.kind === 'checkbox') {
                          return (
                            <label key={field.id} className="checkbox">
                              <input
                                type="checkbox"
                                checked={Boolean(value)}
                                onChange={event => handleFieldChange(selectedNode, field, event)}
                              />
                              {field.label}
                            </label>
                          );
                        }
                        return (
                          <label key={field.id}>
                            {field.label}
                            <input
                              type="text"
                              value={String(value)}
                              placeholder={field.placeholder}
                              onChange={event => handleFieldChange(selectedNode, field, event)}
                            />
                          </label>
                        );
                      })}
                    </fieldset>
                  ))}
                </section>
              ) : (
                <p className="empty">No form schema attached to this node.</p>
              )}
            </div>
          ) : (
            <p className="empty">Select a node to edit its configuration.</p>
          )}
        </aside>
      </main>
    </div>
  );
};

export default App;