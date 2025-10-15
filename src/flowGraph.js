import { FlowGraphError } from './errors.js';
const defaultId = () => {
    const globalObj = typeof globalThis !== 'undefined' ? globalThis : {};
    const maybeCrypto = globalObj.crypto;
    if (maybeCrypto?.randomUUID) {
        return maybeCrypto.randomUUID();
    }
    return `fg_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
};
function cloneNode(node) {
    return {
        ...node,
        position: { ...node.position },
        size: node.size ? { ...node.size } : undefined,
        ports: node.ports.map(port => ({ ...port })),
        data: node.data ? { ...node.data } : undefined,
        form: node.form
            ? {
                sections: node.form.sections.map(section => ({
                    ...section,
                    fields: section.fields.map(field => ({ ...field, options: field.options ? [...field.options] : undefined })),
                })),
            }
            : undefined,
        metadata: node.metadata ? { ...node.metadata } : undefined,
    };
}
function cloneConnection(connection) {
    return {
        ...connection,
        source: { ...connection.source },
        target: { ...connection.target },
        path: connection.path ? connection.path.map(point => ({ ...point })) : undefined,
        metadata: connection.metadata ? { ...connection.metadata } : undefined,
    };
}
function cloneGroup(group) {
    return {
        ...group,
        nodeIds: [...group.nodeIds],
        bounds: group.bounds
            ? {
                position: { ...group.bounds.position },
                size: { ...group.bounds.size },
            }
            : undefined,
        metadata: group.metadata ? { ...group.metadata } : undefined,
    };
}
export class FlowGraph {
    nodes = new Map();
    connections = new Map();
    groups = new Map();
    metadata;
    viewport;
    listeners = new Set();
    idGenerator;
    constructor(options = {}) {
        this.idGenerator = options.idGenerator ?? defaultId;
        if (options.initialState) {
            this.importState(options.initialState, false);
        }
    }
    getState() {
        return {
            nodes: Array.from(this.nodes.values()).map(cloneNode),
            connections: Array.from(this.connections.values()).map(cloneConnection),
            groups: Array.from(this.groups.values()).map(cloneGroup),
            viewport: this.viewport ? { position: { ...this.viewport.position }, zoom: this.viewport.zoom } : undefined,
            metadata: this.metadata ? { ...this.metadata } : undefined,
        };
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    addNode(node) {
        if (this.nodes.has(node.id)) {
            throw new FlowGraphError('NODE_EXISTS', `Node with id "${node.id}" already exists.`);
        }
        this.validateNode(node);
        const stored = cloneNode(node);
        this.nodes.set(node.id, stored);
        this.emit('node:add', stored);
        return cloneNode(stored);
    }
    updateNode(id, partial) {
        const existing = this.getNodeOrThrow(id);
        const updated = cloneNode({
            ...existing,
            ...partial,
            position: partial.position ? { ...partial.position } : existing.position,
            size: partial.size ? { ...partial.size } : existing.size,
            ports: partial.ports ? partial.ports.map(port => ({ ...port })) : existing.ports,
            data: partial.data ? { ...partial.data } : existing.data,
            metadata: partial.metadata ? { ...partial.metadata } : existing.metadata,
            form: partial.form
                ? {
                    sections: partial.form.sections.map(section => ({
                        ...section,
                        fields: section.fields.map(field => ({ ...field, options: field.options ? [...field.options] : undefined })),
                    })),
                }
                : existing.form,
        });
        this.validateNode(updated);
        this.nodes.set(id, updated);
        this.emit('node:update', updated);
        return cloneNode(updated);
    }
    moveNode(id, position) {
        return this.updateNode(id, { position });
    }
    setNodeData(id, data) {
        return this.updateNode(id, { data });
    }
    removeNode(id) {
        const node = this.getNodeOrThrow(id);
        this.nodes.delete(id);
        // remove connections touching node
        for (const [connectionId, connection] of [...this.connections.entries()]) {
            if (connection.source.nodeId === id || connection.target.nodeId === id) {
                this.connections.delete(connectionId);
            }
        }
        // remove from groups
        for (const group of this.groups.values()) {
            const index = group.nodeIds.indexOf(id);
            if (index >= 0) {
                group.nodeIds.splice(index, 1);
            }
        }
        this.emit('node:remove', node);
    }
    getNode(id) {
        const node = this.nodes.get(id);
        return node ? cloneNode(node) : undefined;
    }
    addConnection(connection) {
        const id = connection.id ?? this.idGenerator();
        if (this.connections.has(id)) {
            throw new FlowGraphError('CONNECTION_EXISTS', `Connection with id "${id}" already exists.`);
        }
        const sourceNode = this.getNodeOrThrow(connection.source.nodeId);
        const targetNode = this.getNodeOrThrow(connection.target.nodeId);
        const sourcePort = this.getPortOrThrow(sourceNode, connection.source.portId);
        const targetPort = this.getPortOrThrow(targetNode, connection.target.portId);
        if (sourcePort.direction !== 'output') {
            throw new FlowGraphError('PORT_DIRECTION_MISMATCH', `Source port "${sourcePort.id}" on node "${sourceNode.id}" is not an output port.`);
        }
        if (targetPort.direction !== 'input') {
            throw new FlowGraphError('PORT_DIRECTION_MISMATCH', `Target port "${targetPort.id}" on node "${targetNode.id}" is not an input port.`);
        }
        this.assertPortCapacity(connection.source, sourcePort);
        this.assertPortCapacity(connection.target, targetPort);
        const stored = cloneConnection({ ...connection, id });
        for (const existing of this.connections.values()) {
            if (existing.source.nodeId === stored.source.nodeId &&
                existing.source.portId === stored.source.portId &&
                existing.target.nodeId === stored.target.nodeId &&
                existing.target.portId === stored.target.portId) {
                throw new FlowGraphError('CONNECTION_EXISTS', `Connection between ${stored.source.nodeId}:${stored.source.portId} -> ${stored.target.nodeId}:${stored.target.portId} already exists.`);
            }
        }
        const loopback = stored.source.nodeId === stored.target.nodeId;
        if (loopback && !((sourcePort.allowLoopback ?? false) || (targetPort.allowLoopback ?? false))) {
            throw new FlowGraphError('INVALID_STATE', `Loopback connection on node "${stored.source.nodeId}" requires allowLoopback to be enabled on at least one port.`);
        }
        this.connections.set(id, stored);
        this.emit('connection:add', stored);
        return cloneConnection(stored);
    }
    updateConnection(id, partial) {
        const existing = this.getConnectionOrThrow(id);
        const updated = cloneConnection({
            ...existing,
            ...partial,
            source: partial.source ? { ...partial.source } : existing.source,
            target: partial.target ? { ...partial.target } : existing.target,
            path: partial.path ? partial.path.map(point => ({ ...point })) : existing.path,
            metadata: partial.metadata ? { ...partial.metadata } : existing.metadata,
        });
        const sourceNode = this.getNodeOrThrow(updated.source.nodeId);
        const targetNode = this.getNodeOrThrow(updated.target.nodeId);
        const sourcePort = this.getPortOrThrow(sourceNode, updated.source.portId);
        const targetPort = this.getPortOrThrow(targetNode, updated.target.portId);
        if (sourcePort.direction !== 'output') {
            throw new FlowGraphError('PORT_DIRECTION_MISMATCH', `Source port "${sourcePort.id}" on node "${sourceNode.id}" is not an output port.`);
        }
        if (targetPort.direction !== 'input') {
            throw new FlowGraphError('PORT_DIRECTION_MISMATCH', `Target port "${targetPort.id}" on node "${targetNode.id}" is not an input port.`);
        }
        const loopback = updated.source.nodeId === updated.target.nodeId;
        if (loopback && !((sourcePort.allowLoopback ?? false) || (targetPort.allowLoopback ?? false))) {
            throw new FlowGraphError('INVALID_STATE', `Loopback connection on node "${updated.source.nodeId}" requires allowLoopback to be enabled on at least one port.`);
        }
        this.assertPortCapacity(updated.source, sourcePort, id);
        this.assertPortCapacity(updated.target, targetPort, id);
        for (const entry of this.connections.values()) {
            if (entry.id !== id &&
                entry.source.nodeId === updated.source.nodeId &&
                entry.source.portId === updated.source.portId &&
                entry.target.nodeId === updated.target.nodeId &&
                entry.target.portId === updated.target.portId) {
                throw new FlowGraphError('CONNECTION_EXISTS', `Connection between ${updated.source.nodeId}:${updated.source.portId} -> ${updated.target.nodeId}:${updated.target.portId} already exists.`);
            }
        }
        this.connections.set(id, updated);
        this.emit('connection:update', updated);
        return cloneConnection(updated);
    }
    removeConnection(id) {
        const connection = this.connections.get(id);
        if (!connection) {
            throw new FlowGraphError('CONNECTION_NOT_FOUND', `Connection with id "${id}" not found.`);
        }
        this.connections.delete(id);
        this.emit('connection:remove', connection);
    }
    getConnection(id) {
        const connection = this.connections.get(id);
        return connection ? cloneConnection(connection) : undefined;
    }
    addGroup(group) {
        if (this.groups.has(group.id)) {
            throw new FlowGraphError('GROUP_EXISTS', `Group with id "${group.id}" already exists.`);
        }
        this.validateGroup(group);
        const stored = cloneGroup(group);
        this.groups.set(group.id, stored);
        this.emit('group:add', stored);
        return cloneGroup(stored);
    }
    updateGroup(id, partial) {
        const existing = this.getGroupOrThrow(id);
        const updated = cloneGroup({
            ...existing,
            ...partial,
            nodeIds: partial.nodeIds ? [...partial.nodeIds] : existing.nodeIds,
            bounds: partial.bounds
                ? {
                    position: { ...partial.bounds.position },
                    size: { ...partial.bounds.size },
                }
                : existing.bounds,
            metadata: partial.metadata ? { ...partial.metadata } : existing.metadata,
        });
        this.validateGroup(updated);
        this.groups.set(id, updated);
        this.emit('group:update', updated);
        return cloneGroup(updated);
    }
    removeGroup(id) {
        const group = this.groups.get(id);
        if (!group) {
            throw new FlowGraphError('GROUP_NOT_FOUND', `Group with id "${id}" not found.`);
        }
        this.groups.delete(id);
        for (const nodeId of group.nodeIds) {
            const node = this.nodes.get(nodeId);
            if (node && node.groupId === id) {
                node.groupId = undefined;
                this.emit('node:update', cloneNode(node));
            }
        }
        this.emit('group:remove', cloneGroup(group));
    }
    assignNodeToGroup(nodeId, groupId) {
        const node = this.getNodeOrThrow(nodeId);
        const previousGroupId = node.groupId ?? null;
        let targetGroup;
        if (groupId !== null) {
            targetGroup = this.getGroupOrThrow(groupId);
            if (!targetGroup.nodeIds.includes(nodeId)) {
                targetGroup.nodeIds.push(nodeId);
            }
        }
        if (previousGroupId && previousGroupId !== groupId) {
            const previousGroup = this.groups.get(previousGroupId);
            if (previousGroup) {
                previousGroup.nodeIds = previousGroup.nodeIds.filter(id => id !== nodeId);
                this.emit('group:update', cloneGroup(previousGroup));
            }
        }
        node.groupId = groupId ?? undefined;
        if (targetGroup) {
            this.emit('group:update', cloneGroup(targetGroup));
        }
        this.nodes.set(nodeId, node);
        this.emit('node:update', cloneNode(node));
    }
    setViewport(position, zoom) {
        this.viewport = { position: { ...position }, zoom };
        this.emit('graph:metadata', { viewport: this.viewport });
    }
    setMetadata(metadata) {
        this.metadata = metadata ? { ...metadata } : undefined;
        this.emit('graph:metadata', { metadata: this.metadata });
    }
    importState(state, notify = true) {
        if (!state) {
            throw new FlowGraphError('INVALID_STATE', 'Cannot import empty graph state.');
        }
        this.nodes.clear();
        this.connections.clear();
        this.groups.clear();
        for (const node of state.nodes ?? []) {
            this.validateNode(node);
            this.nodes.set(node.id, cloneNode(node));
        }
        for (const group of state.groups ?? []) {
            this.validateGroup(group);
            this.groups.set(group.id, cloneGroup(group));
        }
        for (const connection of state.connections ?? []) {
            const sourceNode = this.getNodeOrThrow(connection.source.nodeId);
            const targetNode = this.getNodeOrThrow(connection.target.nodeId);
            const sourcePort = this.getPortOrThrow(sourceNode, connection.source.portId);
            const targetPort = this.getPortOrThrow(targetNode, connection.target.portId);
            if (sourcePort.direction !== 'output' || targetPort.direction !== 'input') {
                throw new FlowGraphError('INVALID_STATE', `Connection "${connection.id}" has incompatible port directions.`);
            }
            const loopback = connection.source.nodeId === connection.target.nodeId;
            if (loopback && !((sourcePort.allowLoopback ?? false) || (targetPort.allowLoopback ?? false))) {
                throw new FlowGraphError('INVALID_STATE', `Loopback connection "${connection.id}" not permitted without allowLoopback flag.`);
            }
            this.assertPortCapacity(connection.source, sourcePort);
            this.assertPortCapacity(connection.target, targetPort);
            for (const existing of this.connections.values()) {
                if (existing.source.nodeId === connection.source.nodeId &&
                    existing.source.portId === connection.source.portId &&
                    existing.target.nodeId === connection.target.nodeId &&
                    existing.target.portId === connection.target.portId) {
                    throw new FlowGraphError('CONNECTION_EXISTS', `Duplicate connection detected for ${connection.source.nodeId}:${connection.source.portId} -> ${connection.target.nodeId}:${connection.target.portId}.`);
                }
            }
            this.connections.set(connection.id, cloneConnection(connection));
        }
        this.viewport = state.viewport
            ? { position: { ...state.viewport.position }, zoom: state.viewport.zoom }
            : undefined;
        this.metadata = state.metadata ? { ...state.metadata } : undefined;
        if (notify) {
            this.emit('graph:import', this.getState());
        }
    }
    toJSON() {
        return this.getState();
    }
    emit(reason, payload) {
        if (this.listeners.size === 0) {
            return;
        }
        const state = this.getState();
        const event = {
            reason,
            state,
            payload,
        };
        for (const listener of this.listeners) {
            listener(event);
        }
    }
    getNodeOrThrow(id) {
        const node = this.nodes.get(id);
        if (!node) {
            throw new FlowGraphError('NODE_NOT_FOUND', `Node with id "${id}" not found.`);
        }
        return node;
    }
    getGroupOrThrow(id) {
        const group = this.groups.get(id);
        if (!group) {
            throw new FlowGraphError('GROUP_NOT_FOUND', `Group with id "${id}" not found.`);
        }
        return group;
    }
    getPortOrThrow(node, portId) {
        const port = node.ports.find(p => p.id === portId);
        if (!port) {
            throw new FlowGraphError('PORT_NOT_FOUND', `Port with id "${portId}" not found on node "${node.id}".`);
        }
        return port;
    }
    validateNode(node) {
        const portIds = new Set();
        for (const port of node.ports) {
            if (portIds.has(port.id)) {
                throw new FlowGraphError('INVALID_STATE', `Duplicate port id "${port.id}" on node "${node.id}".`);
            }
            portIds.add(port.id);
            this.validatePort(port, node.id);
        }
    }
    validatePort(port, nodeId) {
        if (port.direction !== 'input' && port.direction !== 'output') {
            throw new FlowGraphError('INVALID_STATE', `Port "${port.id}" on node "${nodeId}" has invalid direction.`);
        }
        if (port.maxConnections !== undefined && port.maxConnections < 0) {
            throw new FlowGraphError('INVALID_STATE', `Port "${port.id}" on node "${nodeId}" has invalid maxConnections.`);
        }
    }
    validateGroup(group) {
        const seen = new Set();
        for (const nodeId of group.nodeIds) {
            if (seen.has(nodeId)) {
                throw new FlowGraphError('INVALID_STATE', `Group "${group.id}" contains duplicate node "${nodeId}".`);
            }
            seen.add(nodeId);
            if (!this.nodes.has(nodeId)) {
                throw new FlowGraphError('NODE_NOT_FOUND', `Group "${group.id}" references missing node "${nodeId}".`);
            }
        }
    }
    assertPortCapacity(address, port, excludeConnectionId) {
        if (port.maxConnections === undefined) {
            return;
        }
        const used = this.countConnections(address, port.direction, excludeConnectionId);
        if (used >= port.maxConnections) {
            throw new FlowGraphError('PORT_CONNECTION_LIMIT', `Port "${port.id}" on node "${address.nodeId}" exceeded max connections of ${port.maxConnections}.`);
        }
    }
    countConnections(address, direction, excludeConnectionId) {
        let count = 0;
        for (const connection of this.connections.values()) {
            if (excludeConnectionId && connection.id === excludeConnectionId) {
                continue;
            }
            const side = direction === 'output' ? connection.source : connection.target;
            if (side.nodeId === address.nodeId && side.portId === address.portId) {
                count += 1;
            }
        }
        return count;
    }
    getConnectionOrThrow(id) {
        const connection = this.connections.get(id);
        if (!connection) {
            throw new FlowGraphError('CONNECTION_NOT_FOUND', `Connection with id "${id}" not found.`);
        }
        return connection;
    }
}
//# sourceMappingURL=flowGraph.js.map