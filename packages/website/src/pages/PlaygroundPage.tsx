import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FlowGraphState } from '@flowtomic/flowgraph';
import { FlowGraphError } from '@flowtomic/flowgraph';
import { FlowCanvas, useFlowgraph, type FlowCanvasHandle } from '@flowtomic/flowgraph-react';
import type { FlowgraphRendererOptions, FlowgraphRendererSelection } from '@flowtomic/flowgraph-core-view';
import styles from '../styles/PlaygroundPage.module.css';

const templates: Record<string, FlowGraphState> = {
  workflow: {
    nodes: [
      {
        id: 'start',
        label: 'Webhook Trigger',
        position: { x: 120, y: 160 },
        ports: [{ id: 'out', direction: 'output', label: 'next' }],
      },
      {
        id: 'router',
        label: 'Branch Logic',
        position: { x: 420, y: 120 },
        ports: [
          { id: 'in', direction: 'input', label: 'entry', maxConnections: 1 },
          { id: 'success', direction: 'output', label: 'continue' },
          { id: 'fallback', direction: 'output', label: 'fallback' },
        ],
      },
      {
        id: 'notify',
        label: 'Notify Customer',
        position: { x: 700, y: 80 },
        ports: [
          { id: 'in', direction: 'input', label: 'payload', maxConnections: 1 },
          { id: 'done', direction: 'output', label: 'done' },
        ],
      },
      {
        id: 'log',
        label: 'Log Error',
        position: { x: 700, y: 240 },
        ports: [{ id: 'in', direction: 'input', label: 'failure', maxConnections: 4 }],
      },
    ],
    connections: [
      { id: 'edge-1', source: { nodeId: 'start', portId: 'out' }, target: { nodeId: 'router', portId: 'in' } },
      { id: 'edge-2', source: { nodeId: 'router', portId: 'success' }, target: { nodeId: 'notify', portId: 'in' } },
      { id: 'edge-3', source: { nodeId: 'router', portId: 'fallback' }, target: { nodeId: 'log', portId: 'in' } },
      { id: 'edge-4', source: { nodeId: 'notify', portId: 'done' }, target: { nodeId: 'log', portId: 'in' } },
    ],
    groups: [],
  },
  uml: {
    nodes: [
      {
        id: 'user',
        label: 'User',
        position: { x: 120, y: 160 },
        ports: [
          { id: 'association', direction: 'output', label: 'association' },
        ],
        metadata: { stereotype: 'actor' },
      },
      {
        id: 'login',
        label: 'LoginService',
        position: { x: 400, y: 110 },
        ports: [
          { id: 'in', direction: 'input', label: 'uses' },
          { id: 'out', direction: 'output', label: 'calls' },
        ],
      },
      {
        id: 'db',
        label: 'AuthStore',
        position: { x: 640, y: 160 },
        ports: [
          { id: 'in', direction: 'input', label: 'queries' },
        ],
      },
    ],
    connections: [
      { id: 'uml-1', source: { nodeId: 'user', portId: 'association' }, target: { nodeId: 'login', portId: 'in' } },
      { id: 'uml-2', source: { nodeId: 'login', portId: 'out' }, target: { nodeId: 'db', portId: 'in' } },
    ],
    groups: [],
  },
  rag: {
    nodes: [
      {
        id: 'retriever',
        label: 'Vector Retriever',
        position: { x: 140, y: 140 },
        ports: [
          { id: 'input', direction: 'input', label: 'query', maxConnections: 1 },
          { id: 'docs', direction: 'output', label: 'documents' },
        ],
      },
      {
        id: 'ranker',
        label: 'Semantic Ranker',
        position: { x: 440, y: 200 },
        ports: [
          { id: 'in', direction: 'input', label: 'documents', maxConnections: 1 },
          { id: 'out', direction: 'output', label: 'top-k' },
        ],
      },
      {
        id: 'llm',
        label: 'LLM Generator',
        position: { x: 720, y: 160 },
        ports: [
          { id: 'prompt', direction: 'input', label: 'prompt', maxConnections: 1 },
          { id: 'response', direction: 'output', label: 'answer' },
        ],
      },
      {
        id: 'eval',
        label: 'Evaluator',
        position: { x: 960, y: 200 },
        ports: [
          { id: 'input', direction: 'input', label: 'answer', maxConnections: 1 },
        ],
      },
    ],
    connections: [
      { id: 'rag-1', source: { nodeId: 'retriever', portId: 'docs' }, target: { nodeId: 'ranker', portId: 'in' } },
      { id: 'rag-2', source: { nodeId: 'ranker', portId: 'out' }, target: { nodeId: 'llm', portId: 'prompt' } },
      { id: 'rag-3', source: { nodeId: 'llm', portId: 'response' }, target: { nodeId: 'eval', portId: 'input' } },
    ],
    groups: [],
  },
};

const PlaygroundPage = (): JSX.Element => {
  const { graph, state } = useFlowgraph();
  const canvasRef = useRef<FlowCanvasHandle | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<keyof typeof templates>('workflow');
  const [selection, setSelection] = useState<FlowgraphRendererSelection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inspectorExpanded, setInspectorExpanded] = useState(true);

  const stateJson = useMemo(() => JSON.stringify(state, null, 2), [state]);

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

  const applyTemplate = useCallback(
    (templateKey: keyof typeof templates) => {
      const template = templates[templateKey];
      graph.importState(template);
      setSelectedTemplate(templateKey);
      setSelection({ nodeId: template.nodes[0]?.id ?? null, connectionId: null });
      setError(null);
      requestAnimationFrame(() => {
        const firstNodeId = template.nodes[0]?.id;
        if (firstNodeId) {
          canvasRef.current?.getRenderer()?.focusNode(firstNodeId);
        }
      });
    },
    [graph],
  );

  useEffect(() => {
    if (state.nodes.length === 0) {
      applyTemplate('workflow');
    }
  }, [applyTemplate, state.nodes.length]);

  const clearSelection = useCallback(() => {
    setSelection({ nodeId: null, connectionId: null });
  }, []);

  const deleteSelection = useCallback(() => {
    if (selection?.connectionId) {
      try {
        graph.removeConnection(selection.connectionId);
        clearSelection();
      } catch (err) {
        setError(err instanceof FlowGraphError ? err.message : String(err));
      }
      return;
    }
    if (selection?.nodeId) {
      try {
        graph.removeNode(selection.nodeId);
        clearSelection();
      } catch (err) {
        setError(err instanceof FlowGraphError ? err.message : String(err));
      }
    }
  }, [graph, selection, clearSelection]);

  return (
    <div className={styles.playground}>
      <aside className={styles.sidebar}>
        <h1>Playground</h1>
        <p>
          Switch templates, drag nodes, draft connections, and export the resulting graph. Everything you see is powered
          by the same Flowgraph state engine.
        </p>

        <label className={styles.controlLabel} htmlFor="template-select">
          Template
          <select
            id="template-select"
            value={selectedTemplate}
            onChange={event => applyTemplate(event.target.value as keyof typeof templates)}
          >
            {Object.keys(templates).map(key => (
              <option key={key} value={key}>
                {key.toUpperCase()}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.actions}>
          <button type="button" onClick={() => applyTemplate(selectedTemplate)}>Reset template</button>
          <button type="button" onClick={deleteSelection} disabled={!selection?.nodeId && !selection?.connectionId}>
            Delete selection
          </button>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(stateJson).catch(() => {});
            }}
          >
            Copy JSON
          </button>
        </div>

        <div className={styles.stats}>
          <div>
            <span className={styles.statLabel}>Nodes</span>
            <span className={styles.statValue}>{state.nodes.length}</span>
          </div>
          <div>
            <span className={styles.statLabel}>Connections</span>
            <span className={styles.statValue}>{state.connections.length}</span>
          </div>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <p className={styles.tip}>
          Tip: drag empty canvas space to pan, scroll to zoom, double-click an edge to delete it, and use the toolbar to
          copy the current graph state.
        </p>
      </aside>

      <main className={styles.stage}>
        <FlowCanvas
          ref={canvasRef}
          graph={graph}
          rendererOptions={rendererOptions}
          selection={selection ?? undefined}
        />
        <section className={styles.inspector} data-expanded={inspectorExpanded ? 'true' : 'false'}>
          <header>
            <span>Graph state</span>
            <div className={styles.inspectorControls}>
              <button type="button" onClick={() => setInspectorExpanded(value => !value)}>
                {inspectorExpanded ? 'Collapse' : 'Expand'}
              </button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(stateJson).catch(() => {});
                }}
              >
                Copy
              </button>
            </div>
          </header>
          {inspectorExpanded ? <pre>{stateJson}</pre> : null}
        </section>
      </main>
    </div>
  );
};

export default PlaygroundPage;