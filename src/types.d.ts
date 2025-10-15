export type PortDirection = 'input' | 'output';
export interface Point {
    x: number;
    y: number;
}
export interface Size {
    width: number;
    height: number;
}
export interface GraphPort {
    /** Unique identifier within the node. */
    id: string;
    /** Logical grouping key (e.g. "success" or "error"). */
    key?: string;
    label?: string;
    direction: PortDirection;
    /** Optional semantic type hint that UIs can use for styling or validation. */
    dataType?: string;
    /** Maximum number of connections that can attach to the port. */
    maxConnections?: number;
    /** If true, the port may connect to another port on the same node. */
    allowLoopback?: boolean;
    /** Arbitrary metadata to preserve custom behaviour. */
    metadata?: Record<string, unknown>;
}
export interface PortAddress {
    nodeId: string;
    portId: string;
}
export interface GraphConnection {
    id: string;
    source: PortAddress;
    target: PortAddress;
    /** Optional bezier control points or routing hints. */
    path?: Point[];
    metadata?: Record<string, unknown>;
}
export interface NodeFormFieldOption {
    value: string;
    label: string;
}
export type NodeFormFieldKind = 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'json' | 'code' | 'custom';
export interface NodeFormField {
    id: string;
    label: string;
    kind: NodeFormFieldKind;
    description?: string;
    placeholder?: string;
    defaultValue?: unknown;
    required?: boolean;
    options?: NodeFormFieldOption[];
    /** Arbitrary props that the renderer can forward to its widgets. */
    props?: Record<string, unknown>;
}
export interface NodeFormSection {
    id: string;
    title?: string;
    description?: string;
    fields: NodeFormField[];
}
export interface NodeFormSchema {
    sections: NodeFormSection[];
}
export interface GraphNode<TData = Record<string, unknown>> {
    id: string;
    label: string;
    description?: string;
    position: Point;
    size?: Size;
    /** Node-local configuration data. */
    data?: TData;
    /** Ports that determine where connections can attach. */
    ports: GraphPort[];
    /** Optional form schema that a UI can render for editing the node. */
    form?: NodeFormSchema;
    /** Optional group membership. */
    groupId?: string | null;
    /** Node-level metadata for custom renderers. */
    metadata?: Record<string, unknown>;
    /** When true the node should be treated as read-only in the editor. */
    readonly?: boolean;
}
export interface GraphGroup {
    id: string;
    label: string;
    description?: string;
    /** Nodes contained in the group. */
    nodeIds: string[];
    /** Visual hints for the renderer. */
    bounds?: {
        position: Point;
        size: Size;
    };
    metadata?: Record<string, unknown>;
}
export interface FlowGraphState<TNodeData = Record<string, unknown>> {
    nodes: GraphNode<TNodeData>[];
    connections: GraphConnection[];
    groups: GraphGroup[];
    viewport?: {
        position: Point;
        zoom: number;
    };
    /** Arbitrary metadata stored at graph level. */
    metadata?: Record<string, unknown>;
}
export type GraphUpdateReason = 'node:add' | 'node:remove' | 'node:update' | 'node:move' | 'node:data' | 'group:add' | 'group:remove' | 'group:update' | 'connection:add' | 'connection:remove' | 'connection:update' | 'graph:import' | 'graph:metadata';
export interface GraphChangeEvent<TNodeData = Record<string, unknown>> {
    reason: GraphUpdateReason;
    state: FlowGraphState<TNodeData>;
    payload?: unknown;
}
//# sourceMappingURL=types.d.ts.map