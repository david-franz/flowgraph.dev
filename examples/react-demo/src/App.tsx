import { useEffect, useMemo, useState } from 'react';
import type { FlowGraphState } from '@flowtomic/flowgraph';
import { FlowGraph } from '@flowtomic/flowgraph';

type GraphData = FlowGraphState;

const createDemoGraph = (graph: FlowGraph): void => {
  if (graph.getState().nodes.length > 0) {
    return;
  }

  graph.addNode({
    id: 'trigger',
    label: 'Start Trigger',
    position: { x: 80, y: 160 },
    ports: [
      { id: 'out', direction: 'output', label: 'next' },
    ],
    metadata: { icon: 'bolt' },
  });

  graph.addNode({
    id: 'http',
    label: 'Fetch data (HTTP)',
    position: { x: 320, y: 160 },
    ports: [
      { id: 'in', direction: 'input', label: 'trigger' },
      { id: 'success', direction: 'output', label: 'success' },
      { id: 'error', direction: 'output', label: 'error', allowLoopback: true },
    ],
    form: {
      sections: [
        {
          id: 'request',
          title: 'HTTP request',
          fields: [
            { id: 'method', label: 'Method', kind: 'select', options: [
              { value: 'GET', label: 'GET' },
              { value: 'POST', label: 'POST' },
            ], defaultValue: 'GET' },
            { id: 'url', label: 'URL', kind: 'text', placeholder: 'https://api.flowtomic.ai' },
            { id: 'body', label: 'Body', kind: 'json', description: 'Request payload (optional)' },
          ],
        },
      ],
    },
  });

  graph.addNode({
    id: 'dfpp',
    label: 'df++ Run Model',
    position: { x: 600, y: 110 },
    ports: [
      { id: 'in', direction: 'input', label: 'input' },
      { id: 'out', direction: 'output', label: 'result' },
    ],
    form: {
      sections: [
        {
          id: 'model',
          title: 'Model execution',
          fields: [
            { id: 'engine', label: 'Engine', kind: 'select', options: [
              { value: 'dfpp:jvm@latest', label: 'df++ JVM (latest)' },
              { value: 'dfpp:jvm@lts', label: 'df++ JVM (LTS)' },
            ], defaultValue: 'dfpp:jvm@latest' },
            { id: 'script', label: 'Script', kind: 'code', description: 'df++ script body' },
          ],
        },
      ],
    },
  });

  graph.addNode({
    id: 'log',
    label: 'Log Result',
    position: { x: 600, y: 220 },
    ports: [
      { id: 'in', direction: 'input', label: 'payload' },
    ],
  });

  graph.addConnection({
    source: { nodeId: 'trigger', portId: 'out' },
    target: { nodeId: 'http', portId: 'in' },
  });
  graph.addConnection({
    source: { nodeId: 'http', portId: 'success' },
    target: { nodeId: 'dfpp', portId: 'in' },
  });
  graph.addConnection({
    source: { nodeId: 'dfpp', portId: 'out' },
    target: { nodeId: 'log', portId: 'in' },
  });
  graph.addConnection({
    source: { nodeId: 'http', portId: 'error' },
    target: { nodeId: 'http', portId: 'in' },
    path: [
      { x: 320, y: 280 },
      { x: 200, y: 280 },
      { x: 200, y: 160 },
    ],
  });
};

const useFlowGraph = (): [FlowGraph, GraphData] => {
  const graph = useMemo(() => new FlowGraph(), []);
  const [state, setState] = useState<GraphData>(() => graph.getState());

  useEffect(() => {
    createDemoGraph(graph);
    setState(graph.getState());
    const unsubscribe = graph.subscribe(event => {
      setState(event.state);
    });
    return unsubscribe;
  }, [graph]);

  return [graph, state];
};

const App = (): JSX.Element => {
  const [graph, state] = useFlowGraph();

  const addNode = () => {
    const id = `node-${Math.random().toString(36).slice(2, 7)}`;
    graph.addNode({
      id,
      label: `Utility ${state.nodes.length + 1}`,
      position: { x: 120 + Math.random() * 480, y: 80 + Math.random() * 240 },
      ports: [
        { id: 'in', direction: 'input', label: 'in', maxConnections: 1 },
        { id: 'out', direction: 'output', label: 'out' },
      ],
    });
  };

  const clearGraph = () => {
    graph.importState({ nodes: [], connections: [], groups: [] });
  };

  return (
    <div style={{ padding: '2rem', display: 'flex', gap: '2rem', minHeight: '100vh' }}>
      <aside style={{ width: '260px' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>FlowGraph Demo</h1>
        <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
          A barebones React viewer that renders the state produced by <code>@flowtomic/flowgraph</code>.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button onClick={addNode} style={buttonStyle}>
            Add utility node
          </button>
          <button onClick={clearGraph} style={{ ...buttonStyle, background: 'transparent', border: '1px solid #64748b' }}>
            Reset graph
          </button>
        </div>
        <section style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Groups</h2>
          {state.groups.length === 0 ? (
            <p style={{ color: '#64748b' }}>No groups defined.</p>
          ) : (
            <ul>
              {state.groups.map(group => (
                <li key={group.id}>
                  <strong>{group.label}</strong>
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                    {group.nodeIds.length} nodes
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      <main style={{ flex: 1 }}>
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>Nodes</h2>
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {state.nodes.map(node => (
              <article key={node.id} style={cardStyle}>
                <header style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600 }}>{node.label}</span>
                  <code style={{ color: '#38bdf8' }}>{node.id}</code>
                </header>
                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#94a3b8' }}>
                  Position: ({Math.round(node.position.x)}, {Math.round(node.position.y)})
                </div>
                <div style={{ marginTop: '0.75rem' }}>
                  <strong style={{ fontSize: '0.85rem' }}>Ports</strong>
                  <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', color: '#cbd5f5' }}>
                    {node.ports.map(port => (
                      <li key={port.id}>
                        <code>{port.id}</code>
                        <span style={{ color: '#64748b', marginLeft: '0.25rem' }}>({port.direction})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>Connections</h2>
          {state.connections.length === 0 ? (
            <p style={{ color: '#64748b' }}>No connections yet.</p>
          ) : (
            <ul style={{ lineHeight: 1.8 }}>
              {state.connections.map(conn => (
                <li key={conn.id ?? `${conn.source.nodeId}-${conn.target.nodeId}` }>
                  <span>
                    <code>{conn.source.nodeId}:{conn.source.portId}</code>
                    <span style={{ margin: '0 0.5rem', color: '#64748b' }}>→</span>
                    <code>{conn.target.nodeId}:{conn.target.portId}</code>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
};

const buttonStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  borderRadius: '0.75rem',
  border: 'none',
  background: 'linear-gradient(120deg, #14b8a6, #2563eb)',
  color: '#f8fafc',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'transform 0.15s ease',
};

const cardStyle: React.CSSProperties = {
  background: 'rgba(15, 23, 42, 0.65)',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  borderRadius: '1rem',
  padding: '1rem',
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.45)',
  backdropFilter: 'blur(24px)',
};

export default App;