import type { FlowGraph, GraphConnection, GraphNode, Point, PortAddress } from '@flowtomic/flowgraph';
export interface FlowgraphRendererTheme {
    background: string;
    nodeFill: string;
    nodeStroke: string;
    nodeLabel: string;
    portFill: string;
    connection: string;
    connectionSelected: string;
    draft: string;
    miniMapBackground: string;
}
export type FlowgraphConnectionValidator<TNodeData extends Record<string, unknown>> = (source: PortAddress, target: PortAddress, graph: FlowGraph<TNodeData>) => boolean | string;
export interface FlowgraphRendererViewport {
    position: Point;
    zoom: number;
}
export interface FlowgraphRendererSelection {
    nodeId?: string | null;
    connectionId?: string | null;
}
export interface FlowgraphRendererOptions<TNodeData extends Record<string, unknown> = Record<string, unknown>> {
    /** Explicit width in pixels. Defaults to 100% of the host container. */
    width?: number;
    /** Explicit height in pixels. Defaults to 100% of the host container. */
    height?: number;
    /** @deprecated - use theme.background instead. */
    background?: string;
    /** Dimensions used for default node layout and connection anchors. */
    nodeSize?: {
        width: number;
        height: number;
    };
    /** Corner radius for node rectangles. */
    nodeCornerRadius?: number;
    /** Vertical spacing between ports of the same direction. */
    portSpacing?: number;
    /** Distance from node top edge to the first port. */
    portRegionPadding?: number;
    /** Minimum bezier control distance for auto-generated connections. */
    connectionMinControlDistance?: number;
    /** Master switch for pointer interactions. */
    interactive?: boolean;
    /** When true, wheel/pinch zooming is enabled. */
    allowZoom?: boolean;
    /** When true, canvas panning (dragging the background) is enabled. */
    allowPan?: boolean;
    /** When true, nodes can be dragged. */
    allowNodeDrag?: boolean;
    /** Sync viewport changes back to FlowGraph.setViewport. Default true. */
    syncViewport?: boolean;
    /** Display a minimap preview overlay. */
    showMiniMap?: boolean;
    /** Minimap location. */
    miniMapPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    /** Minimap dimensions. */
    miniMapSize?: {
        width: number;
        height: number;
    };
    /** Connection arrow style. */
    connectionArrow?: 'arrow' | 'circle' | 'none';
    /** Render a grid behind the graph. */
    showGrid?: boolean;
    /** Grid cell size in pixels. */
    gridSize?: number;
    /** Snap dragged nodes to the nearest grid intersection. */
    snapToGrid?: boolean;
    /** Minimum and maximum zoom levels. */
    zoomExtent?: [number, number];
    /** Theme overrides. */
    theme?: Partial<FlowgraphRendererTheme>;
    /** Custom connection validation prior to committing edge creation. */
    validateConnection?: FlowgraphConnectionValidator<TNodeData>;
    /** Invoked when a node is selected. */
    onNodeSelect?: (node: GraphNode<TNodeData>) => void;
    /** Invoked when a connection is selected. */
    onConnectionSelect?: (connection: GraphConnection) => void;
    /** Invoked whenever the viewport (zoom/pan) changes. */
    onViewportChange?: (viewport: FlowgraphRendererViewport) => void;
    /** Invoked when a connection is created through the renderer. */
    onConnectionCreate?: (connection: GraphConnection) => void;
    /** Invoked when attempting to create a connection fails. */
    onConnectionError?: (error: unknown) => void;
    /** Optional initial selection. */
    initialSelection?: FlowgraphRendererSelection | null;
}
export declare class FlowgraphRenderer<TNodeData extends Record<string, unknown> = Record<string, unknown>> {
    private readonly container;
    private readonly graph;
    private readonly svg;
    private readonly background;
    private readonly scene;
    private readonly gridRect;
    private readonly connectionLayer;
    private readonly draftPath;
    private readonly nodeLayer;
    private readonly zoomBehavior;
    private readonly overlay;
    private readonly miniMapRoot;
    private readonly miniMapSvg;
    private readonly miniMapConnectionsGroup;
    private readonly miniMapNodesGroup;
    private readonly miniMapLabelsGroup;
    private readonly miniMapViewportRect;
    private readonly arrowMarker;
    private readonly circleMarker;
    private readonly gridPattern;
    private readonly gridPathHorizontal;
    private readonly gridPathVertical;
    private selection;
    private options;
    private dragState;
    private draft;
    private unsubscribe?;
    private transform;
    private suppressViewportEmit;
    private applyingViewport;
    private miniMapBounds;
    private miniMapScale;
    private readonly gridPatternId;
    private pointerMoveHandler;
    private pointerUpHandler;
    private pointerCancelHandler;
    private keydownHandler;
    constructor(container: HTMLElement, graph: FlowGraph<TNodeData>, options?: FlowgraphRendererOptions<TNodeData>);
    destroy(): void;
    updateOptions(patch: Partial<FlowgraphRendererOptions<TNodeData>>): void;
    setSelection(selection: FlowgraphRendererSelection): void;
    getSelection(): FlowgraphRendererSelection;
    getViewport(): FlowgraphRendererViewport;
    focusNode(nodeId: string): void;
    private mergeOptions;
    private applyVisualOptions;
    private updateInteractivity;
    private configureZoomFilter;
    private updateMarkers;
    private updateGridPattern;
    private updateZoomExtent;
    private shouldAllowZoom;
    private ensureContainerSetup;
    private applyMiniMapPosition;
    private createDefs;
    private render;
    private renderNodes;
    private renderPorts;
    private getPortTransform;
    private renderConnections;
    private getConnectionMarkerUrl;
    private getConnectionPath;
    private getPortAnchor;
    private handleZoom;
    private handleZoomStart;
    private handleZoomEnd;
    private transformToViewport;
    private viewportEquals;
    private applyViewport;
    private handleNodePointerDown;
    private handleNodeDoubleClick;
    private handlePointerMove;
    private handlePointerUp;
    private detachGlobalListeners;
    private handleConnectionPointerDown;
    private handleConnectionDoubleClick;
    private syncSelection;
    private handlePortPointerDown;
    private handlePortPointerEnter;
    private handlePortPointerLeave;
    private pointerToWorld;
    private updateDraftPath;
    private updateDraftIndicators;
    private updateMiniMap;
    private updateMiniMapViewport;
    private handleKeydown;
}
//# sourceMappingURL=renderer.d.ts.map