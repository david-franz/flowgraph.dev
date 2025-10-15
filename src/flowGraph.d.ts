import { FlowGraphState, GraphChangeEvent, GraphConnection, GraphGroup, GraphNode, GraphNodeTemplate, Point } from './types.js';
type FlowGraphListener<TNodeData> = (event: GraphChangeEvent<TNodeData>) => void;
export interface FlowGraphOptions<TNodeData = Record<string, unknown>> {
    initialState?: FlowGraphState<TNodeData>;
    idGenerator?: () => string;
    templates?: GraphNodeTemplate<TNodeData>[];
}
export declare class FlowGraph<TNodeData extends Record<string, unknown> = Record<string, unknown>> {
    private readonly nodes;
    private readonly connections;
    private readonly groups;
    private readonly templates;
    private metadata;
    private viewport;
    private readonly listeners;
    private readonly idGenerator;
    constructor(options?: FlowGraphOptions<TNodeData>);
    getState(): FlowGraphState<TNodeData>;
    subscribe(listener: FlowGraphListener<TNodeData>): () => void;
    registerTemplate(template: GraphNodeTemplate<TNodeData>): GraphNodeTemplate<TNodeData>;
    registerTemplates(templates: GraphNodeTemplate<TNodeData>[]): GraphNodeTemplate<TNodeData>[];
    unregisterTemplate(id: string): void;
    getTemplate(id: string): GraphNodeTemplate<TNodeData> | undefined;
    listTemplates(): GraphNodeTemplate<TNodeData>[];
    updateTemplate(id: string, partial: Partial<Omit<GraphNodeTemplate<TNodeData>, 'id'>>): GraphNodeTemplate<TNodeData>;
    createNodeFromTemplate(templateId: string, overrides?: Partial<Omit<GraphNode<TNodeData>, 'id'>> & {
        id?: string;
    }): GraphNode<TNodeData>;
    addNodeFromTemplate(templateId: string, overrides?: Partial<Omit<GraphNode<TNodeData>, 'id'>> & {
        id?: string;
    }): GraphNode<TNodeData>;
    addNode(node: GraphNode<TNodeData>): GraphNode<TNodeData>;
    updateNode(id: string, partial: Partial<Omit<GraphNode<TNodeData>, 'id'>>): GraphNode<TNodeData>;
    moveNode(id: string, position: Point): GraphNode<TNodeData>;
    setNodeData(id: string, data: TNodeData): GraphNode<TNodeData>;
    removeNode(id: string): void;
    getNode(id: string): GraphNode<TNodeData> | undefined;
    addConnection(connection: Omit<GraphConnection, 'id'> & {
        id?: string;
    }): GraphConnection;
    updateConnection(id: string, partial: Partial<Omit<GraphConnection, 'id'>>): GraphConnection;
    removeConnection(id: string): void;
    getConnection(id: string): GraphConnection | undefined;
    addGroup(group: GraphGroup): GraphGroup;
    updateGroup(id: string, partial: Partial<Omit<GraphGroup, 'id'>>): GraphGroup;
    removeGroup(id: string): void;
    assignNodeToGroup(nodeId: string, groupId: string | null): void;
    setViewport(position: Point, zoom: number): void;
    setMetadata(metadata: Record<string, unknown> | undefined): void;
    importState(state: FlowGraphState<TNodeData>, notify?: boolean): void;
    toJSON(): FlowGraphState<TNodeData>;
    private emit;
    private addTemplateInternal;
    private getTemplateOrThrow;
    private getNodeOrThrow;
    private getGroupOrThrow;
    private getPortOrThrow;
    private validateNode;
    private validatePort;
    private validateGroup;
    private validateTemplate;
    private validatePorts;
    private allowsColor;
    private validatePortCompatibility;
    private resolveConnectionColor;
    private assertPortCapacity;
    private countConnections;
    private getConnectionOrThrow;
}
export {};
//# sourceMappingURL=flowGraph.d.ts.map