import type { FlowGraphState, GraphConnection, GraphGroup, GraphNode } from './types.js';

export type NavigatorItemKind = 'node' | 'connection' | 'group';

export interface FlowGraphNavigatorItem {
  id: string;
  label: string;
  kind: NavigatorItemKind;
  subtitle?: string;
  groupId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface FlowGraphNavigatorSection {
  id: string;
  label: string;
  kind: 'nodes' | 'connections' | 'groups';
  items: FlowGraphNavigatorItem[];
}

export interface FlowGraphNavigatorSummary {
  sections: FlowGraphNavigatorSection[];
  totals: {
    nodes: number;
    connections: number;
    groups: number;
  };
}

const createNodeItem = <TNodeData>(node: GraphNode<TNodeData>): FlowGraphNavigatorItem => ({
  id: node.id,
  label: node.label || node.id,
  kind: 'node',
  subtitle: node.groupId ? `Group: ${node.groupId}` : undefined,
  groupId: node.groupId ?? null,
  metadata: {
    position: node.position,
    ports: node.ports.length,
  },
});

const createConnectionItem = (connection: GraphConnection): FlowGraphNavigatorItem => ({
  id: connection.id,
  label: `${connection.source.nodeId}:${connection.source.portId} → ${connection.target.nodeId}:${connection.target.portId}`,
  kind: 'connection',
  metadata: {
    source: connection.source,
    target: connection.target,
    pathPoints: connection.path?.length ?? 0,
  },
});

const createGroupItem = (group: GraphGroup): FlowGraphNavigatorItem => ({
  id: group.id,
  label: group.label || group.id,
  kind: 'group',
  subtitle: `${group.nodeIds.length} node${group.nodeIds.length === 1 ? '' : 's'}`,
  metadata: {
    nodeIds: [...group.nodeIds],
  },
});

export const buildNavigatorSummary = <TNodeData>(state: FlowGraphState<TNodeData>): FlowGraphNavigatorSummary => {
  const nodeItems = state.nodes
    .map(node => createNodeItem(node))
    .sort((a, b) => a.label.localeCompare(b.label));
  const connectionItems = state.connections
    .map(createConnectionItem)
    .sort((a, b) => a.label.localeCompare(b.label));
  const groupItems = state.groups.map(createGroupItem).sort((a, b) => a.label.localeCompare(b.label));

  return {
    sections: [
      { id: 'nodes', label: 'Nodes', kind: 'nodes', items: nodeItems },
      { id: 'connections', label: 'Connections', kind: 'connections', items: connectionItems },
      { id: 'groups', label: 'Groups', kind: 'groups', items: groupItems },
    ],
    totals: {
      nodes: nodeItems.length,
      connections: connectionItems.length,
      groups: groupItems.length,
    },
  };
};