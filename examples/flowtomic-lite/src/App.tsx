import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ChangeEvent } from 'react';
import type {
  FlowGraphState,
  GraphConnection,
  GraphNode,
  GraphPort,
  NodeFormField,
  NodeFormSchema,
  PortAddress,
  FlowGraphNavigatorItem,
  FlowGraphNavigatorSection,
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

interface NodeTemplate {
  id: string;
  label: string;
  description: string;
  form?: NodeFormSchema;
  ports: GraphPort[];
}

const nodeTemplates: NodeTemplate[] = [
  {
    id: 'script-task',
    label: 'Script Task',
    description: 'Execute a df++ script snippet with custom variables.',
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
    description: 'Fetch data from an external API and emit results.',
    ports: [
      { id: 'in', direction: 'input', label: 'trigger', maxConnections: 1 },
      { id: 'success', direction: 'output', label: '200 OK' },
      { id: 'failure', direction: 'output', label: 'non-200' },
    ],
    form: {
      sections: [
        {
          id: 'http-config',
          title: 'Request configuration',
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

const randomPosition = (): { x: number; y: number } => ({
  x: 60 + Math.round(Math.random() * 480),
  y: 60 + Math.round(Math.random() * 320),
});

const createNodeFromTemplate = (template: NodeTemplate): GraphNode => {
  const position = randomPosition();
  return {
    id: `${template.id}-${crypto.randomUUID().slice(0, 5)}`,
    label: template.label,
    position,
    ports: template.ports.map(port => ({ ...port })),
    data: {},
    form: template.form,
  };
};

const App = (): JSX.Element => {
  const graph = useMemo(() => new FlowGraph(), []);
  const [snapshot, setSnapshot] = useState<GraphSnapshot>(() => graph.getState());
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [draft, setDraft] = useState<ConnectionDraft | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [showNavigator, setShowNavigator] = useState(true);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const portElements = useRef<Map<string, HTMLDivElement | null>>(new Map());

  useEffect(() => {
    if (graph.getState().nodes.length === 0) {
      // Seed with one template of each type
      nodeTemplates.forEach(template => {
        graph.addNode(createNodeFromTemplate(template));
      });
    }
    setSnapshot(graph.getState());
    return graph.subscribe(event => setSnapshot(event.state));
  }, [graph]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
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

    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
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

  const getPortKey = (address: PortAddress) => `${address.nodeId}:${address.portId}`;

  const setPortRef = (address: PortAddress, element: HTMLDivElement | null) => {
    const key = getPortKey(address);
    if (element) portElements.current.set(key, element);
    else portElements.current.delete(key);
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

  const addNodeFromTemplate = useCallback(
    (template: NodeTemplate) => {
      const newNode = createNodeFromTemplate(template);
      const created = graph.addNode(newNode);
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

  const handleNodePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, node: GraphNode) => {
      if ((event.target as HTMLElement).closest('[data-port-id]')) return;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      setDragging({
        id: node.id,
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      });
      setSelectedNodeId(node.id);
      setFocusedNodeId(node.id);
      setSelectedConnectionId(null);
    },
    [],
  );

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
      setSelectedConnectionId(null);
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
  }, [draft, graph]);

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

  const handleCanvasPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target === canvasRef.current) {
      setSelectedConnectionId(null);
      setSelectedNodeId(null);
      setFocusedNodeId(null);
    }
  }, []);

  const handleNavigatorItemClick = useCallback(
    (section: FlowGraphNavigatorSection, item: FlowGraphNavigatorItem) => {
      if (section.kind === 'nodes') {
        setSelectedNodeId(item.id);
        setFocusedNodeId(item.id);
        setSelectedConnectionId(null);
      }
      if (section.kind === 'connections') {
        setSelectedConnectionId(item.id);
      }
    },
    [],
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
          <div className="canvas" ref={canvasRef} onPointerDown={handleCanvasPointerDown}>
            <svg className="edges" width="100%" height="100%">
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