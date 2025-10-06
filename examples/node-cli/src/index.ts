import { FlowGraph, buildNavigatorSummary } from '@flowtomic/flowgraph';

const graph = new FlowGraph({
  initialState: {
    nodes: [
      {
        id: 'ingest-orders',
        label: 'Ingest Orders',
        position: { x: 80, y: 120 },
        ports: [
          { id: 'out', direction: 'output', label: 'ready' },
        ],
      },
      {
        id: 'validate-payment',
        label: 'Validate Payment',
        position: { x: 320, y: 120 },
        ports: [
          { id: 'in', direction: 'input', label: 'orders', maxConnections: 1 },
          { id: 'success', direction: 'output', label: 'valid' },
          { id: 'failed', direction: 'output', label: 'failed', allowLoopback: true },
        ],
      },
      {
        id: 'notify-customer',
        label: 'Notify Customer',
        position: { x: 560, y: 80 },
        ports: [
          { id: 'in', direction: 'input', label: 'payment ok', maxConnections: 1 },
        ],
      },
      {
        id: 'raise-ticket',
        label: 'Raise Support Ticket',
        position: { x: 560, y: 200 },
        ports: [
          { id: 'in', direction: 'input', label: 'payment failed', maxConnections: 1 },
        ],
      },
    ],
    groups: [
      {
        id: 'fulfilment',
        label: 'Fulfilment Stage',
        nodeIds: ['validate-payment'],
      },
    ],
    connections: [
      {
        id: 'edge-1',
        source: { nodeId: 'ingest-orders', portId: 'out' },
        target: { nodeId: 'validate-payment', portId: 'in' },
      },
      {
        id: 'edge-2',
        source: { nodeId: 'validate-payment', portId: 'success' },
        target: { nodeId: 'notify-customer', portId: 'in' },
      },
      {
        id: 'edge-3',
        source: { nodeId: 'validate-payment', portId: 'failed' },
        target: { nodeId: 'raise-ticket', portId: 'in' },
      },
    ],
  },
});

const summary = buildNavigatorSummary(graph.getState());

console.log('📦 Supply chain orchestration graph summary');
console.log('----------------------------------------');
console.log(`Nodes: ${summary.totals.nodes}`);
console.log(`Connections: ${summary.totals.connections}`);
console.log(`Groups: ${summary.totals.groups}`);
console.log();

for (const section of summary.sections) {
  console.log(section.label.toUpperCase());
  for (const item of section.items) {
    const subtitle = item.subtitle ? ` — ${item.subtitle}` : '';
    console.log(` • ${item.label}${subtitle}`);
  }
  console.log();
}

// Demonstrate programmatic mutation
const escalation = graph.addNode({
  id: 'escalate',
  label: 'Escalate to Specialist',
  position: { x: 780, y: 240 },
  ports: [
    { id: 'in', direction: 'input', label: 'tickets', maxConnections: 1 },
    { id: 'out', direction: 'output', label: 'resolved' },
  ],
});

graph.addConnection({
  source: { nodeId: 'raise-ticket', portId: 'in' },
  target: { nodeId: escalation.id, portId: 'in' },
});

const updated = buildNavigatorSummary(graph.getState());
console.log('After adding escalation step:');
console.log(`Nodes: ${updated.totals.nodes}, Connections: ${updated.totals.connections}`);