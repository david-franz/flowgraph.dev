const createNodeItem = (node) => ({
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
const createConnectionItem = (connection) => ({
    id: connection.id,
    label: `${connection.source.nodeId}:${connection.source.portId} → ${connection.target.nodeId}:${connection.target.portId}`,
    kind: 'connection',
    metadata: {
        source: connection.source,
        target: connection.target,
        pathPoints: connection.path?.length ?? 0,
    },
});
const createGroupItem = (group) => ({
    id: group.id,
    label: group.label || group.id,
    kind: 'group',
    subtitle: `${group.nodeIds.length} node${group.nodeIds.length === 1 ? '' : 's'}`,
    metadata: {
        nodeIds: [...group.nodeIds],
    },
});
export const buildNavigatorSummary = (state) => {
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
//# sourceMappingURL=navigator.js.map