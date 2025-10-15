export default `import { useEffect } from 'react';
import { FlowCanvas, useFlowgraph } from '@flowtomic/flowgraph-react';

const Example = () => {
  const { graph } = useFlowgraph();

  useEffect(() => {
    if (graph.getState().nodes.length === 0) {
      graph.importState({
        nodes: [
          {
            id: 'trigger',
            label: 'Trigger',
            position: { x: 160, y: 160 },
            ports: [
              { id: 'out', direction: 'output', label: 'next' },
            ],
          },
          {
            id: 'action',
            label: 'Action',
            position: { x: 360, y: 160 },
            ports: [
              { id: 'in', direction: 'input', label: 'trigger', maxConnections: 1 },
              { id: 'out', direction: 'output', label: 'done' },
            ],
          },
        ],
        connections: [
          {
            id: 'edge-1',
            source: { nodeId: 'trigger', portId: 'out' },
            target: { nodeId: 'action', portId: 'in' },
          },
        ],
        groups: [],
      });

      graph.updateConnection('edge-1', {
        metadata: { label: 'default' },
      });
    }
  }, [graph]);

  return (
    <div style={{ height: 420 }}>
      <FlowCanvas graph={graph} />
    </div>
  );
};`;