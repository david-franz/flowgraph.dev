import { select, Selection } from 'd3-selection';
import { zoom, zoomIdentity, ZoomBehavior, ZoomTransform } from 'd3-zoom';
import type {
  FlowGraph,
  FlowGraphState,
  GraphConnection,
  GraphNode,
  GraphPort,
  Point,
  PortAddress,
} from '@flowtomic/flowgraph';
import type { D3ZoomEvent } from 'd3-zoom';

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

export type FlowgraphConnectionValidator<TNodeData extends Record<string, unknown>> = (
  source: PortAddress,
  target: PortAddress,
  graph: FlowGraph<TNodeData>,
) => boolean | string;

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
  nodeSize?: { width: number; height: number };
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
  miniMapSize?: { width: number; height: number };
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

const DEFAULT_THEME: FlowgraphRendererTheme = {
  background: '#0f172a',
  nodeFill: '#1e293b',
  nodeStroke: '#334155',
  nodeLabel: '#e2e8f0',
  portFill: '#38bdf8',
  connection: '#38bdf8',
  connectionSelected: '#facc15',
  draft: '#475569',
  miniMapBackground: 'rgba(15, 23, 42, 0.86)',
};

const DEFAULT_MINIMAP_SIZE = { width: 200, height: 140 };
const DEFAULT_MINIMAP_PADDING = 12;
const DEFAULT_GRID_SIZE = 32;
const GRID_CANVAS_SIZE = 20000;

const DEFAULT_OPTIONS: Required<
  Pick<
    FlowgraphRendererOptions,
    | 'nodeSize'
    | 'nodeCornerRadius'
    | 'portSpacing'
    | 'portRegionPadding'
    | 'connectionMinControlDistance'
    | 'interactive'
    | 'syncViewport'
    | 'allowZoom'
    | 'allowPan'
    | 'allowNodeDrag'
    | 'showMiniMap'
    | 'miniMapPosition'
    | 'miniMapSize'
    | 'connectionArrow'
    | 'showGrid'
    | 'gridSize'
    | 'snapToGrid'
    | 'zoomExtent'
  >
> = {
  nodeSize: { width: 220, height: 160 },
  nodeCornerRadius: 16,
  portSpacing: 28,
  portRegionPadding: 52,
  connectionMinControlDistance: 80,
  interactive: true,
  syncViewport: true,
  allowZoom: true,
  allowPan: true,
  allowNodeDrag: true,
  showMiniMap: true,
  miniMapPosition: 'top-right',
  miniMapSize: DEFAULT_MINIMAP_SIZE,
  connectionArrow: 'arrow',
  showGrid: false,
  gridSize: DEFAULT_GRID_SIZE,
  snapToGrid: false,
  zoomExtent: [0.3, 2.5],
};

interface DragState {
  nodeId: string;
  pointerId: number;
  originX: number;
  originY: number;
  startX: number;
  startY: number;
  element: SVGGraphicsElement | null;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

interface ConnectionDraft {
  pointerId: number;
  source: PortAddress;
  current: Point;
  target: PortAddress | null;
}

interface FlowgraphRendererResolvedOptions<TNodeData extends Record<string, unknown>> {
  width?: number;
  height?: number;
  nodeSize: { width: number; height: number };
  nodeCornerRadius: number;
  portSpacing: number;
  portRegionPadding: number;
  connectionMinControlDistance: number;
  interactive: boolean;
  syncViewport: boolean;
  allowZoom: boolean;
  allowPan: boolean;
  allowNodeDrag: boolean;
  showMiniMap: boolean;
  miniMapPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  miniMapSize: { width: number; height: number };
  connectionArrow: 'arrow' | 'circle' | 'none';
  showGrid: boolean;
  gridSize: number;
  snapToGrid: boolean;
  zoomExtent: [number, number];
  onNodeSelect?: (node: GraphNode<TNodeData>) => void;
  onConnectionSelect?: (connection: GraphConnection) => void;
  onViewportChange?: (viewport: FlowgraphRendererViewport) => void;
  onConnectionCreate?: (connection: GraphConnection) => void;
  onConnectionError?: (error: unknown) => void;
  initialSelection: FlowgraphRendererSelection | null;
  theme: FlowgraphRendererTheme;
  validateConnection?: FlowgraphConnectionValidator<TNodeData>;
}

export class FlowgraphRenderer<TNodeData extends Record<string, unknown> = Record<string, unknown>> {
  private readonly container: HTMLElement;
  private readonly graph: FlowGraph<TNodeData>;
  private readonly svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private readonly background: Selection<SVGRectElement, unknown, null, undefined>;
  private readonly scene: Selection<SVGGElement, unknown, null, undefined>;
  private readonly gridRect: Selection<SVGRectElement, unknown, null, undefined>;
  private readonly connectionLayer: Selection<SVGGElement, unknown, null, undefined>;
  private readonly draftPath: Selection<SVGPathElement, unknown, null, undefined>;
  private readonly nodeLayer: Selection<SVGGElement, unknown, null, undefined>;
  private readonly zoomBehavior: ZoomBehavior<SVGSVGElement, unknown>;
  private readonly overlay: Selection<HTMLElement, unknown, null, undefined>;
  private readonly miniMapRoot: Selection<HTMLElement, unknown, null, undefined>;
  private readonly miniMapSvg: Selection<SVGSVGElement, unknown, null, undefined>;
  private readonly miniMapNodesGroup: Selection<SVGGElement, unknown, null, undefined>;
  private readonly miniMapViewportRect: Selection<SVGRectElement, unknown, null, undefined>;
  private readonly arrowMarker: Selection<SVGMarkerElement, unknown, null, undefined>;
  private readonly circleMarker: Selection<SVGMarkerElement, unknown, null, undefined>;
  private readonly gridPattern: Selection<SVGPatternElement, unknown, null, undefined>;
  private readonly gridPathHorizontal: Selection<SVGPathElement, unknown, null, undefined>;
  private readonly gridPathVertical: Selection<SVGPathElement, unknown, null, undefined>;

  private selection: FlowgraphRendererSelection = {};
  private options: FlowgraphRendererResolvedOptions<TNodeData>;
  private dragState: DragState | null = null;
  private draft: ConnectionDraft | null = null;
  private unsubscribe?: () => void;
  private transform: ZoomTransform = zoomIdentity;
  private suppressViewportEmit = false;
  private applyingViewport = false;
  private miniMapBounds = { minX: 0, minY: 0, width: 1, height: 1 };
  private miniMapScale = 1;
  private readonly gridPatternId: string;

  private pointerMoveHandler = (event: PointerEvent) => this.handlePointerMove(event);
  private pointerUpHandler = (event: PointerEvent) => this.handlePointerUp(event);
  private pointerCancelHandler = (event: PointerEvent) => this.handlePointerUp(event);
  private keydownHandler = (event: KeyboardEvent) => this.handleKeydown(event);

  constructor(container: HTMLElement, graph: FlowGraph<TNodeData>, options: FlowgraphRendererOptions<TNodeData> = {}) {
    if (!(container instanceof HTMLElement)) {
      throw new Error('FlowgraphRenderer requires a valid container element.');
    }
    this.container = container;
    this.graph = graph;
    this.options = this.mergeOptions(options);

    this.ensureContainerSetup();

    this.svg = select<SVGSVGElement, unknown>(container)
      .append('svg')
      .attr('class', 'fg-svg')
      .attr('part', 'canvas');

    if (this.options.width) {
      this.svg.attr('width', this.options.width);
    } else {
      this.svg.attr('width', '100%');
    }
    if (this.options.height) {
      this.svg.attr('height', this.options.height);
    } else {
      this.svg.attr('height', '100%');
    }

    this.background = this.svg
      .append('rect')
      .attr('class', 'fg-background')
      .attr('fill', this.options.theme.background)
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('pointer-events', 'all');

    this.gridPatternId = `fg-grid-${Math.random().toString(16).slice(2)}`;
    const defs = this.svg.append('defs');
    const markers = this.createDefs(defs);
    this.arrowMarker = markers.arrow;
    this.circleMarker = markers.circle;
    this.gridPattern = markers.grid;
    this.gridPathHorizontal = markers.gridHorizontal;
    this.gridPathVertical = markers.gridVertical;

    this.scene = this.svg.append('g').attr('class', 'fg-scene');
    this.gridRect = this.scene
      .append('rect')
      .attr('class', 'fg-grid')
      .attr('x', -GRID_CANVAS_SIZE / 2)
      .attr('y', -GRID_CANVAS_SIZE / 2)
      .attr('width', GRID_CANVAS_SIZE)
      .attr('height', GRID_CANVAS_SIZE)
      .attr('pointer-events', 'none');
    this.connectionLayer = this.scene.append('g').attr('class', 'fg-layer fg-layer--connections');
    this.draftPath = this.connectionLayer
      .append('path')
      .attr('class', 'fg-connection fg-connection--draft')
      .attr('fill', 'none')
      .attr('stroke', this.options.theme.draft)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '8 6')
      .attr('pointer-events', 'none')
      .style('opacity', 0.9)
      .style('visibility', 'hidden');
    this.nodeLayer = this.scene.append('g').attr('class', 'fg-layer fg-layer--nodes');

    this.overlay = select(container)
      .append('div')
      .attr('class', 'fg-overlay')
      .style('position', 'absolute')
      .style('inset', '0')
      .style('pointer-events', 'none');

    this.miniMapRoot = this.overlay
      .append('div')
      .attr('class', 'fg-minimap')
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('border-radius', '12px')
      .style('border', '1px solid rgba(148, 163, 184, 0.35)')
      .style('overflow', 'hidden')
      .style('box-shadow', '0 12px 30px rgba(15, 23, 42, 0.35)');

    this.miniMapSvg = this.miniMapRoot
      .append('svg')
      .attr('class', 'fg-minimap-svg')
      .attr('width', this.options.miniMapSize.width)
      .attr('height', this.options.miniMapSize.height)
      .attr('viewBox', `0 0 ${this.options.miniMapSize.width} ${this.options.miniMapSize.height}`)
      .style('display', 'block');

    this.miniMapNodesGroup = this.miniMapSvg.append('g').attr('class', 'fg-minimap-nodes');
    this.miniMapViewportRect = this.miniMapSvg
      .append('rect')
      .attr('class', 'fg-minimap-viewport')
      .attr('fill', 'none')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4 3');

    this.zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent(this.options.zoomExtent)
      .on('start', event => this.handleZoomStart(event))
      .on('zoom', event => this.handleZoom(event.transform))
      .on('end', () => this.handleZoomEnd());

    this.applyVisualOptions();
    this.applyMiniMapPosition();
    this.updateMarkers();
    this.configureZoomFilter();
    this.updateInteractivity();

    if (options.initialSelection) {
      this.selection = { ...options.initialSelection };
    }

    const initialState = this.graph.getState();
    this.render(initialState);
    this.unsubscribe = this.graph.subscribe(event => {
      this.render(event.state);
    });

    window.addEventListener('keydown', this.keydownHandler);
  }

  destroy(): void {
    this.unsubscribe?.();
    this.detachGlobalListeners();
    this.svg.remove();
    this.overlay.remove();
    window.removeEventListener('keydown', this.keydownHandler);
  }

  updateOptions(patch: Partial<FlowgraphRendererOptions<TNodeData>>): void {
    const next: FlowgraphRendererOptions<TNodeData> = { ...this.options, ...patch };
    if (patch.nodeSize) {
      next.nodeSize = { ...patch.nodeSize };
    }
    this.options = this.mergeOptions(next);
    this.applyVisualOptions();
    this.applyMiniMapPosition();
    this.updateMarkers();
    this.configureZoomFilter();
    this.updateInteractivity();
    const state = this.graph.getState();
    this.render(state);
    if (patch.initialSelection !== undefined) {
      const nextSelection = patch.initialSelection ?? { nodeId: null, connectionId: null };
      this.setSelection(nextSelection);
    }
  }

  setSelection(selection: FlowgraphRendererSelection): void {
    this.selection = { ...selection };
    this.syncSelection();
  }

  getSelection(): FlowgraphRendererSelection {
    return { ...this.selection };
  }

  getViewport(): FlowgraphRendererViewport {
    return this.transformToViewport(this.transform);
  }

  focusNode(nodeId: string): void {
    const node = this.graph.getNode(nodeId);
    if (!node) {
      return;
    }
    const viewport = this.transformToViewport(this.transform);
    const width = this.options.nodeSize.width;
    const height = this.options.nodeSize.height;
    const centerX = node.position.x + width / 2;
    const centerY = node.position.y + height / 2;
    const containerRect = this.container.getBoundingClientRect();
    const offsetX = containerRect.width / 2 / viewport.zoom - centerX;
    const offsetY = containerRect.height / 2 / viewport.zoom - centerY;
    this.applyViewport({ position: { x: -offsetX, y: -offsetY }, zoom: viewport.zoom }, true);
  }

  private mergeOptions(options: FlowgraphRendererOptions<TNodeData>): FlowgraphRendererResolvedOptions<TNodeData> {
    const theme: FlowgraphRendererTheme = {
      ...DEFAULT_THEME,
      ...(options.theme ?? {}),
    };
    if (options.background) {
      theme.background = options.background;
    }

    const nodeSize = { ...DEFAULT_OPTIONS.nodeSize, ...(options.nodeSize ?? {}) };
    const miniMapSize = { ...(options.miniMapSize ?? DEFAULT_OPTIONS.miniMapSize) };
    const gridSize = Math.max(4, options.gridSize ?? DEFAULT_OPTIONS.gridSize);
    const requestedZoom = options.zoomExtent ?? DEFAULT_OPTIONS.zoomExtent;
    const zoomMin = Math.max(0.05, Math.min(requestedZoom[0], requestedZoom[1]));
    const zoomMax = Math.max(zoomMin + 0.01, Math.max(requestedZoom[0], requestedZoom[1]));

    return {
      width: options.width,
      height: options.height,
      nodeSize,
      nodeCornerRadius: options.nodeCornerRadius ?? DEFAULT_OPTIONS.nodeCornerRadius,
      portSpacing: options.portSpacing ?? DEFAULT_OPTIONS.portSpacing,
      portRegionPadding: options.portRegionPadding ?? DEFAULT_OPTIONS.portRegionPadding,
      connectionMinControlDistance:
        options.connectionMinControlDistance ?? DEFAULT_OPTIONS.connectionMinControlDistance,
      interactive: options.interactive ?? DEFAULT_OPTIONS.interactive,
      allowZoom: options.allowZoom ?? DEFAULT_OPTIONS.allowZoom,
      allowPan: options.allowPan ?? DEFAULT_OPTIONS.allowPan,
      allowNodeDrag: options.allowNodeDrag ?? DEFAULT_OPTIONS.allowNodeDrag,
      syncViewport: options.syncViewport ?? DEFAULT_OPTIONS.syncViewport,
      showMiniMap: options.showMiniMap ?? DEFAULT_OPTIONS.showMiniMap,
      miniMapPosition: options.miniMapPosition ?? DEFAULT_OPTIONS.miniMapPosition,
      miniMapSize,
      connectionArrow: options.connectionArrow ?? DEFAULT_OPTIONS.connectionArrow,
      showGrid: options.showGrid ?? DEFAULT_OPTIONS.showGrid,
      gridSize,
      snapToGrid: options.snapToGrid ?? DEFAULT_OPTIONS.snapToGrid,
      zoomExtent: [zoomMin, zoomMax],
      onNodeSelect: options.onNodeSelect,
      onConnectionSelect: options.onConnectionSelect,
      onViewportChange: options.onViewportChange,
      onConnectionCreate: options.onConnectionCreate,
      onConnectionError: options.onConnectionError,
      initialSelection: options.initialSelection ?? null,
      theme,
      validateConnection: options.validateConnection,
    };
  }

  private applyVisualOptions(): void {
    if (this.options.width) {
      this.svg.attr('width', this.options.width);
    } else {
      this.svg.attr('width', '100%');
    }
    if (this.options.height) {
      this.svg.attr('height', this.options.height);
    } else {
      this.svg.attr('height', '100%');
    }
    this.background.attr('fill', this.options.theme.background);
    this.miniMapRoot
      .style('background', this.options.theme.miniMapBackground)
      .style('display', this.options.showMiniMap ? 'block' : 'none');
    this.miniMapSvg
      .attr('width', this.options.miniMapSize.width)
      .attr('height', this.options.miniMapSize.height)
      .attr('viewBox', `0 0 ${this.options.miniMapSize.width} ${this.options.miniMapSize.height}`);
    this.miniMapViewportRect.attr('stroke', this.options.theme.connection);
    this.gridRect
      .style('visibility', this.options.showGrid ? 'visible' : 'hidden')
      .attr('fill', this.options.showGrid ? `url(#${this.gridPatternId})` : 'none');
    this.updateGridPattern();
    this.updateZoomExtent();
  }

  private updateInteractivity(): void {
    if (this.options.interactive) {
      this.svg.call(this.zoomBehavior);
      this.svg.on('dblclick.zoom', null);
      this.svg.style('cursor', this.options.allowPan ? 'grab' : 'default');
      this.background.attr('pointer-events', this.options.allowPan || this.options.allowZoom ? 'all' : 'none');
    } else {
      this.svg.on('.zoom', null);
      this.svg.style('cursor', 'default');
      this.background.attr('pointer-events', 'none');
    }
  }

  private configureZoomFilter(): void {
    this.zoomBehavior.filter((event: any) => this.shouldAllowZoom(event));
  }

  private updateMarkers(): void {
    if (this.arrowMarker) {
      this.arrowMarker.selectAll('path').attr('stroke', 'context-stroke');
    }
    if (this.circleMarker) {
      this.circleMarker.selectAll('circle').attr('fill', 'context-stroke');
    }
  }

  private updateGridPattern(): void {
    if (!this.gridPattern) {
      return;
    }
    const size = Math.max(4, this.options.gridSize);
    this.gridPattern.attr('width', size).attr('height', size);
    this.gridPathHorizontal
      .attr('d', `M0 ${size} H${size}`)
      .attr('stroke', this.options.theme.nodeStroke)
      .attr('stroke-width', 0.5)
      .attr('stroke-opacity', 0.35);
    this.gridPathVertical
      .attr('d', `M${size} 0 V${size}`)
      .attr('stroke', this.options.theme.nodeStroke)
      .attr('stroke-width', 0.5)
      .attr('stroke-opacity', 0.35);
  }

  private updateZoomExtent(): void {
    this.zoomBehavior.scaleExtent(this.options.zoomExtent);
  }

  private shouldAllowZoom(event: any): boolean {
    if (!this.options.interactive) {
      return false;
    }
    const type = typeof event?.type === 'string' ? event.type : '';
    if (type === 'wheel' || type === 'dblclick') {
      return this.options.allowZoom;
    }
    if (type.startsWith('pointer') || type.startsWith('touch')) {
      if (!this.options.allowPan) {
        return false;
      }
      const target = event?.target instanceof Element ? (event.target as Element) : null;
      if (target && (target.closest('g.fg-node') || target.closest('g.fg-node-port'))) {
        return false;
      }
      return true;
    }
    return true;
  }

  private ensureContainerSetup(): void {
    const style = this.container.style;
    if (!style.position) {
      style.position = 'relative';
    }
    style.userSelect = 'none';
    style.touchAction = 'none';
  }

  private applyMiniMapPosition(): void {
    const root = this.miniMapRoot;
    if (!root) {
      return;
    }
    if (!this.options.showMiniMap) {
      root.style('display', 'none');
      return;
    }
    root.style('display', 'block');
    const { miniMapPosition, miniMapSize } = this.options;
    const positions: Record<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right', { top: string | null; right: string | null; bottom: string | null; left: string | null }> = {
      'top-left': { top: '16px', right: null, bottom: null, left: '16px' },
      'top-right': { top: '16px', right: '16px', bottom: null, left: null },
      'bottom-left': { top: null, right: null, bottom: '16px', left: '16px' },
      'bottom-right': { top: null, right: '16px', bottom: '16px', left: null },
    };
    const position = positions[miniMapPosition];
    root
      .style('top', position.top ?? 'auto')
      .style('right', position.right ?? 'auto')
      .style('bottom', position.bottom ?? 'auto')
      .style('left', position.left ?? 'auto')
      .style('width', `${miniMapSize.width}px`)
      .style('height', `${miniMapSize.height}px`);
  }

  private createDefs(
    defs: Selection<SVGDefsElement, unknown, null, undefined>,
  ): {
    arrow: Selection<SVGMarkerElement, unknown, null, undefined>;
    circle: Selection<SVGMarkerElement, unknown, null, undefined>;
    grid: Selection<SVGPatternElement, unknown, null, undefined>;
    gridHorizontal: Selection<SVGPathElement, unknown, null, undefined>;
    gridVertical: Selection<SVGPathElement, unknown, null, undefined>;
  } {
    const arrow = defs
      .append('marker')
      .attr('id', 'fg-arrow')
      .attr('viewBox', '0 0 12 12')
      .attr('refX', 10)
      .attr('refY', 6)
      .attr('markerWidth', 12)
      .attr('markerHeight', 12)
      .attr('orient', 'auto-start-reverse')
      .attr('markerUnits', 'userSpaceOnUse');

    arrow
      .append('path')
      .attr('d', 'M2,2 L10,6 L2,10')
      .attr('fill', 'none')
      .attr('stroke', 'context-stroke')
      .attr('stroke-width', 1.5);

    const circle = defs
      .append('marker')
      .attr('id', 'fg-circle')
      .attr('viewBox', '0 0 12 12')
      .attr('refX', 6)
      .attr('refY', 6)
      .attr('markerWidth', 10)
      .attr('markerHeight', 10)
      .attr('orient', 'auto')
      .attr('markerUnits', 'userSpaceOnUse');

    circle
      .append('circle')
      .attr('cx', 6)
      .attr('cy', 6)
      .attr('r', 3)
      .attr('fill', 'context-stroke')
      .attr('stroke', 'none');

    const grid = defs
      .append('pattern')
      .attr('id', this.gridPatternId)
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', this.options.gridSize)
      .attr('height', this.options.gridSize);

    const gridHorizontal = grid
      .append('path')
      .attr('class', 'fg-grid-h')
      .attr('fill', 'none');

    const gridVertical = grid
      .append('path')
      .attr('class', 'fg-grid-v')
      .attr('fill', 'none');

    return { arrow, circle, grid, gridHorizontal, gridVertical } as const;
  }

  private render(state: FlowGraphState<TNodeData>): void {
    if (state.viewport && this.options.syncViewport && !this.suppressViewportEmit) {
      const viewport = state.viewport;
      const current = this.transformToViewport(this.transform);
      if (!this.viewportEquals(viewport, current)) {
        this.applyViewport(viewport, false);
      }
    }

    this.renderConnections(state);
    this.renderNodes(state);
    this.syncSelection();
    this.updateDraftPath();
    this.updateMiniMap(state);
  }

  private renderNodes(state: FlowGraphState<TNodeData>): void {
    const selection = this.nodeLayer
      .selectAll<SVGGElement, GraphNode<TNodeData>>('g.fg-node')
      .data(state.nodes, node => node.id);

    selection.exit().remove();

    const entered = selection
      .enter()
      .append('g')
      .attr('class', 'fg-node')
      .attr('cursor', this.options.interactive && this.options.allowNodeDrag ? 'grab' : 'default')
      .on('pointerdown', (event, node) => this.handleNodePointerDown(event as PointerEvent, node))
      .on('dblclick', (event, node) => this.handleNodeDoubleClick(event as PointerEvent, node));

    entered
      .append('rect')
      .attr('class', 'fg-node-body')
      .attr('width', this.options.nodeSize.width)
      .attr('height', this.options.nodeSize.height)
      .attr('rx', this.options.nodeCornerRadius)
      .attr('ry', this.options.nodeCornerRadius)
      .attr('fill', this.options.theme.nodeFill)
      .attr('stroke', this.options.theme.nodeStroke)
      .attr('stroke-width', 1.5);

    entered
      .append('text')
      .attr('class', 'fg-node-label')
      .attr('x', 16)
      .attr('y', 26)
      .attr('fill', this.options.theme.nodeLabel)
      .attr('font-family', 'sans-serif')
      .attr('font-size', 14)
      .attr('font-weight', 600)
      .text(node => node.label ?? node.id);

    entered
      .append('g')
      .attr('class', 'fg-node-ports fg-node-ports--input');

    entered
      .append('g')
      .attr('class', 'fg-node-ports fg-node-ports--output');

    const merged = entered.merge(selection as Selection<SVGGElement, GraphNode<TNodeData>>);

    merged
      .attr('transform', node => `translate(${node.position.x}, ${node.position.y})`)
      .classed('is-readonly', node => !!node.readonly)
      .attr('cursor', this.options.interactive && this.options.allowNodeDrag ? 'grab' : 'default');

    merged
      .select<SVGRectElement>('rect.fg-node-body')
      .attr('width', this.options.nodeSize.width)
      .attr('height', this.options.nodeSize.height)
      .attr('rx', this.options.nodeCornerRadius)
      .attr('ry', this.options.nodeCornerRadius)
      .attr('fill', this.options.theme.nodeFill)
      .attr('stroke', this.options.theme.nodeStroke);

    merged
      .select<SVGTextElement>('text.fg-node-label')
      .text(node => node.label ?? node.id)
      .attr('fill', this.options.theme.nodeLabel);

    merged.each((node, index, groups) => {
      const group = select(groups[index]);
      this.renderPorts(group, node);
    });
  }

  private renderPorts(group: Selection<SVGGElement, GraphNode<TNodeData>, null, undefined>, node: GraphNode<TNodeData>): void {
    const inputPorts = node.ports.filter(port => port.direction === 'input');
    const outputPorts = node.ports.filter(port => port.direction === 'output');

    const inputSelection = group
      .select<SVGGElement>('g.fg-node-ports--input')
      .selectAll<SVGGElement, GraphPort>('g.fg-node-port')
      .data(inputPorts, port => port.id);

    inputSelection.exit().remove();

    const inputEnter = inputSelection
      .enter()
      .append('g')
      .attr('class', 'fg-node-port fg-node-port--input');

    inputEnter
      .append('circle')
      .attr('class', 'fg-node-port-handle')
      .attr('r', 5)
      .attr('cx', -10)
      .attr('cy', 0)
      .attr('fill', this.options.theme.portFill);

    inputEnter
      .append('text')
      .attr('class', 'fg-node-port-label')
      .attr('x', 0)
      .attr('y', 4)
      .attr('fill', this.options.theme.nodeLabel)
      .attr('font-size', 12)
      .attr('font-family', 'sans-serif')
      .text(port => port.label ?? port.id);

    const inputMerged = inputEnter.merge(inputSelection);
    inputMerged
      .attr('transform', (_port, idx) => this.getPortTransform(idx, 'input'))
      .attr('data-node-id', node.id)
      .attr('data-port-direction', 'input')
      .attr('data-port-id', port => port.id);

    inputMerged
      .selectAll<SVGCircleElement, GraphPort>('circle.fg-node-port-handle')
      .attr('fill', this.options.theme.portFill);

    inputMerged
      .selectAll<SVGTextElement, GraphPort>('text.fg-node-port-label')
      .attr('fill', this.options.theme.nodeLabel);

    const outputSelection = group
      .select<SVGGElement>('g.fg-node-ports--output')
      .selectAll<SVGGElement, GraphPort>('g.fg-node-port')
      .data(outputPorts, port => port.id);

    outputSelection.exit().remove();

    const outputEnter = outputSelection
      .enter()
      .append('g')
      .attr('class', 'fg-node-port fg-node-port--output');

    outputEnter
      .append('text')
      .attr('class', 'fg-node-port-label')
      .attr('x', this.options.nodeSize.width - 60)
      .attr('y', 4)
      .attr('text-anchor', 'end')
      .attr('fill', this.options.theme.nodeLabel)
      .attr('font-size', 12)
      .attr('font-family', 'sans-serif')
      .text(port => port.label ?? port.id);

    outputEnter
      .append('circle')
      .attr('class', 'fg-node-port-handle')
      .attr('r', 5)
      .attr('cx', this.options.nodeSize.width + 10)
      .attr('cy', 0)
      .attr('fill', this.options.theme.portFill);

    const outputMerged = outputEnter.merge(outputSelection);
    outputMerged
      .attr('transform', (_port, idx) => this.getPortTransform(idx, 'output'))
      .select<SVGTextElement>('text.fg-node-port-label')
      .attr('x', this.options.nodeSize.width - 60);

    outputMerged
      .select<SVGCircleElement>('circle.fg-node-port-handle')
      .attr('cx', this.options.nodeSize.width + 10)
      .attr('fill', this.options.theme.portFill);

    outputMerged
      .selectAll<SVGTextElement, GraphPort>('text.fg-node-port-label')
      .attr('fill', this.options.theme.nodeLabel);

    outputMerged
      .attr('data-node-id', node.id)
      .attr('data-port-direction', 'output')
      .attr('data-port-id', port => port.id);

    inputMerged
      .select<SVGCircleElement>('circle.fg-node-port-handle')
      .on('pointerenter', (event, port) => this.handlePortPointerEnter(event as PointerEvent, node, port))
      .on('pointerleave', (event, port) => this.handlePortPointerLeave(event as PointerEvent, node, port));

    outputMerged
      .select<SVGCircleElement>('circle.fg-node-port-handle')
      .on('pointerdown', (event, port) => this.handlePortPointerDown(event as PointerEvent, node, port));
  }

  private getPortTransform(index: number, direction: 'input' | 'output'): string {
    const y = this.options.portRegionPadding + index * this.options.portSpacing;
    const x = direction === 'input' ? 0 : this.options.nodeSize.width;
    return `translate(${x}, ${clamp(y, 36, this.options.nodeSize.height - 16)})`;
  }

  private renderConnections(state: FlowGraphState<TNodeData>): void {
    const nodeLookup = new Map(state.nodes.map(node => [node.id, node]));

    const selection = this.connectionLayer
      .selectAll<SVGPathElement, GraphConnection>('path.fg-connection--entity')
      .data(state.connections, connection => connection.id);

    selection.exit().remove();

    const entered = selection
      .enter()
      .append('path')
      .attr('class', 'fg-connection fg-connection--entity')
      .attr('fill', 'none')
      .attr('stroke', connection => connection.color ?? this.options.theme.connection)
      .attr('stroke-width', 2)
      .attr('opacity', 0.92)
      .on('pointerdown', (event, connection) => this.handleConnectionPointerDown(event as PointerEvent, connection))
      .on('dblclick', (event, connection) => this.handleConnectionDoubleClick(event as PointerEvent, connection));

    const merged = entered.merge(selection as Selection<SVGPathElement, GraphConnection>);
    const markerUrl = this.getConnectionMarkerUrl();
    merged
      .attr('d', connection => this.getConnectionPath(connection, nodeLookup))
      .attr('stroke', connection => connection.color ?? this.options.theme.connection)
      .attr('marker-end', markerUrl ?? null);
  }

  private getConnectionMarkerUrl(): string | null {
    switch (this.options.connectionArrow) {
      case 'arrow':
        return 'url(#fg-arrow)';
      case 'circle':
        return 'url(#fg-circle)';
      default:
        return null;
    }
  }

  private getConnectionPath(
    connection: GraphConnection,
    nodeLookup: Map<string, GraphNode<TNodeData>>,
  ): string {
    const sourceNode = nodeLookup.get(connection.source.nodeId);
    const targetNode = nodeLookup.get(connection.target.nodeId);
    if (!sourceNode || !targetNode) {
      return '';
    }

    const sourcePort = sourceNode.ports.find(port => port.id === connection.source.portId);
    const targetPort = targetNode.ports.find(port => port.id === connection.target.portId);
    if (!sourcePort || !targetPort) {
      return '';
    }

    const start = this.getPortAnchor(sourceNode, sourcePort);
    const end = this.getPortAnchor(targetNode, targetPort);

    if (connection.path && connection.path.length > 0) {
      const segments = connection.path.map(point => `L ${point.x} ${point.y}`).join(' ');
      return `M ${start.x} ${start.y} ${segments} L ${end.x} ${end.y}`;
    }

    const deltaX = end.x - start.x;
    const direction = deltaX >= 0 ? 1 : -1;
    const control = Math.max(this.options.connectionMinControlDistance, Math.abs(deltaX) / 2);

    const cp1x = start.x + control * direction;
    const cp2x = end.x - control * direction;

    return `M ${start.x} ${start.y} C ${cp1x} ${start.y} ${cp2x} ${end.y} ${end.x} ${end.y}`;
  }

  private getPortAnchor(node: GraphNode<TNodeData>, port: GraphPort): Point {
    const ports = node.ports.filter(candidate => candidate.direction === port.direction);
    const index = ports.findIndex(candidate => candidate.id === port.id);
    const y = node.position.y + this.options.portRegionPadding + index * this.options.portSpacing;
    const x = port.direction === 'input' ? node.position.x : node.position.x + this.options.nodeSize.width;
    return { x, y };
  }

  private handleZoom(transform: ZoomTransform): void {
    this.transform = transform;
    this.scene.attr('transform', transform.toString());

    if (this.applyingViewport) {
      return;
    }

    const viewport = this.transformToViewport(transform);
    this.selection = { ...this.selection };
    this.options.onViewportChange?.(viewport);

    if (this.options.syncViewport) {
      this.suppressViewportEmit = true;
      try {
        this.graph.setViewport(viewport.position, viewport.zoom);
      } finally {
        this.suppressViewportEmit = false;
      }
    }

    this.updateMiniMapViewport();
  }

  private handleZoomStart(event: D3ZoomEvent<SVGSVGElement, unknown>): void {
    if (!this.options.interactive || !this.options.allowPan) {
      return;
    }
    const sourceEvent = event.sourceEvent;
    if (sourceEvent instanceof PointerEvent && sourceEvent.buttons === 1) {
      this.svg.style('cursor', 'grabbing');
    }
  }

  private handleZoomEnd(): void {
    if (!this.options.interactive || !this.options.allowPan) {
      return;
    }
    if (!this.dragState && !this.draft) {
      this.svg.style('cursor', 'grab');
    }
  }

  private transformToViewport(transform: ZoomTransform): FlowgraphRendererViewport {
    return {
      position: {
        x: -transform.x / transform.k,
        y: -transform.y / transform.k,
      },
      zoom: transform.k,
    };
  }

  private viewportEquals(a: FlowgraphRendererViewport, b: FlowgraphRendererViewport): boolean {
    const epsilon = 0.01;
    return (
      Math.abs(a.zoom - b.zoom) < epsilon &&
      Math.abs(a.position.x - b.position.x) < epsilon &&
      Math.abs(a.position.y - b.position.y) < epsilon
    );
  }

  private applyViewport(viewport: FlowgraphRendererViewport, smooth: boolean): void {
    const transform = zoomIdentity.scale(viewport.zoom).translate(-viewport.position.x, -viewport.position.y);
    this.applyingViewport = true;
    try {
      if (smooth && typeof (this.svg as any).transition === 'function') {
        (this.svg as any)
          .transition()
          .duration(200)
          .call(this.zoomBehavior.transform, transform);
      } else {
        this.svg.call(this.zoomBehavior.transform, transform);
      }
    } finally {
      this.applyingViewport = false;
    }
  }

  private handleNodePointerDown(event: PointerEvent, node: GraphNode<TNodeData>): void {
    if (!this.options.interactive) {
      return;
    }
    event.stopPropagation();
    this.selection = { nodeId: node.id, connectionId: null };
    this.options.onNodeSelect?.(node);
    this.syncSelection();

    if (!this.options.allowNodeDrag) {
      return;
    }

    const element = event.currentTarget as SVGGraphicsElement | null;
    element?.setPointerCapture?.(event.pointerId);

    this.dragState = {
      nodeId: node.id,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      startX: node.position.x,
      startY: node.position.y,
      element,
    };

    if (this.options.interactive) {
      this.svg.on('.zoom', null);
      this.svg.style('cursor', 'grabbing');
    }

    window.addEventListener('pointermove', this.pointerMoveHandler);
    window.addEventListener('pointerup', this.pointerUpHandler, { once: false });
    window.addEventListener('pointercancel', this.pointerCancelHandler, { once: false });
  }

  private handleNodeDoubleClick(event: PointerEvent, node: GraphNode<TNodeData>): void {
    event.stopPropagation();
    this.focusNode(node.id);
  }

  private handlePointerMove(event: PointerEvent): void {
    if (this.dragState && event.pointerId === this.dragState.pointerId) {
      const scale = this.transform.k || 1;
      const deltaX = (event.clientX - this.dragState.originX) / scale;
      const deltaY = (event.clientY - this.dragState.originY) / scale;
      let nextX = this.dragState.startX + deltaX;
      let nextY = this.dragState.startY + deltaY;
      if (this.options.snapToGrid) {
        const size = Math.max(4, this.options.gridSize);
        nextX = Math.round(nextX / size) * size;
        nextY = Math.round(nextY / size) * size;
      }
      this.graph.moveNode(this.dragState.nodeId, { x: nextX, y: nextY });
      return;
    }

    if (this.draft && event.pointerId === this.draft.pointerId) {
      this.draft.current = this.pointerToWorld(event.clientX, event.clientY);
      this.updateDraftPath();
    }
  }

  private handlePointerUp(event: PointerEvent): void {
    if (this.dragState && event.pointerId === this.dragState.pointerId) {
      this.dragState.element?.releasePointerCapture?.(event.pointerId);
      this.dragState = null;
    }

    if (this.draft && event.pointerId === this.draft.pointerId) {
      const draft = this.draft;
      this.draft = null;
      if (draft.target) {
        let allowConnection = true;
        const validator = this.options.validateConnection;
        if (validator) {
          try {
            const result = validator(draft.source, draft.target, this.graph);
            if (result === false) {
              allowConnection = false;
              this.options.onConnectionError?.(new Error('Connection is not allowed.'));
            } else if (typeof result === 'string') {
              allowConnection = false;
              this.options.onConnectionError?.(new Error(result));
            }
          } catch (error) {
            allowConnection = false;
            this.options.onConnectionError?.(error);
          }
        }

        if (allowConnection) {
          try {
            const connection = this.graph.addConnection({
              source: draft.source,
              target: draft.target,
            });
            this.selection = { nodeId: null, connectionId: connection.id };
            this.options.onConnectionCreate?.(connection);
            this.options.onConnectionSelect?.(connection);
          } catch (error) {
            this.options.onConnectionError?.(error);
          }
        }
      }
      this.updateDraftPath();
      this.syncSelection();
    }

    if (!this.dragState && !this.draft) {
      if (this.options.interactive) {
        this.svg.style('cursor', this.options.allowPan ? 'grab' : 'default');
        this.svg.call(this.zoomBehavior);
        this.configureZoomFilter();
      }
      this.detachGlobalListeners();
    }
  }

  private detachGlobalListeners(): void {
    window.removeEventListener('pointermove', this.pointerMoveHandler);
    window.removeEventListener('pointerup', this.pointerUpHandler);
    window.removeEventListener('pointercancel', this.pointerCancelHandler);
  }

  private handleConnectionPointerDown(event: PointerEvent, connection: GraphConnection): void {
    event.stopPropagation();
    this.selection = { nodeId: null, connectionId: connection.id };
    this.options.onConnectionSelect?.(connection);
    this.syncSelection();
  }

  private handleConnectionDoubleClick(event: PointerEvent, connection: GraphConnection): void {
    event.stopPropagation();
    event.preventDefault();
    try {
      this.graph.removeConnection(connection.id);
      if (this.selection.connectionId === connection.id) {
        this.selection = { nodeId: null, connectionId: null };
        this.syncSelection();
      }
    } catch (error) {
      this.options.onConnectionError?.(error);
    }
  }

  private syncSelection(): void {
    const nodeId = this.selection.nodeId ?? null;
    const connectionId = this.selection.connectionId ?? null;

    this.nodeLayer
      .selectAll<SVGGElement, GraphNode<TNodeData>>('g.fg-node')
      .classed('is-selected', node => node.id === nodeId);

    this.connectionLayer
      .selectAll<SVGPathElement, GraphConnection>('path.fg-connection--entity')
      .classed('is-selected', connection => connection.id === connectionId)
      .attr('stroke-width', connection => (connection.id === connectionId ? 3 : 2))
      .attr('stroke', connection =>
        connection.id === connectionId
          ? this.options.theme.connectionSelected ?? connection.color ?? this.options.theme.connection
          : connection.color ?? this.options.theme.connection,
      )
      .attr('opacity', connection => (connection.id === connectionId ? 1 : 0.92));
  }

  private handlePortPointerDown(event: PointerEvent, node: GraphNode<TNodeData>, port: GraphPort): void {
    if (!this.options.interactive || port.direction !== 'output') {
      return;
    }
    event.stopPropagation();
    event.preventDefault();

    this.selection = { nodeId: node.id, connectionId: null };
    this.options.onNodeSelect?.(node);
    this.syncSelection();

    this.dragState = null;
    this.draft = {
      pointerId: event.pointerId,
      source: { nodeId: node.id, portId: port.id },
      current: this.pointerToWorld(event.clientX, event.clientY),
      target: null,
    };
    this.updateDraftPath();

    window.addEventListener('pointermove', this.pointerMoveHandler);
    window.addEventListener('pointerup', this.pointerUpHandler, { once: false });
    window.addEventListener('pointercancel', this.pointerCancelHandler, { once: false });
  }

  private handlePortPointerEnter(event: PointerEvent, node: GraphNode<TNodeData>, port: GraphPort): void {
    if (!this.draft || port.direction !== 'input' || event.pointerId !== this.draft.pointerId) {
      return;
    }
    if (this.draft.source.nodeId === node.id && this.draft.source.portId === port.id) {
      return;
    }
    this.draft.target = { nodeId: node.id, portId: port.id };
    this.updateDraftPath();
  }

  private handlePortPointerLeave(event: PointerEvent, node: GraphNode<TNodeData>, port: GraphPort): void {
    if (!this.draft || port.direction !== 'input' || event.pointerId !== this.draft.pointerId) {
      return;
    }
    if (this.draft.target && this.draft.target.nodeId === node.id && this.draft.target.portId === port.id) {
      this.draft.target = null;
      this.updateDraftPath();
    }
  }

  private pointerToWorld(clientX: number, clientY: number): Point {
    const rect = this.container.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    const x = (screenX - this.transform.x) / this.transform.k;
    const y = (screenY - this.transform.y) / this.transform.k;
    return { x, y };
  }

  private updateDraftPath(): void {
    const draft = this.draft;
    if (!draft) {
      this.draftPath.style('visibility', 'hidden');
      this.updateDraftIndicators();
      return;
    }

    const sourceNode = this.graph.getNode(draft.source.nodeId);
    const sourcePort = sourceNode?.ports.find(port => port.id === draft.source.portId);
    if (!sourceNode || !sourcePort) {
      this.draft = null;
      this.draftPath.style('visibility', 'hidden');
      this.updateDraftIndicators();
      return;
    }

    const start = this.getPortAnchor(sourceNode, sourcePort);
    let end: Point | null = null;

    if (draft.target) {
      const targetNode = this.graph.getNode(draft.target.nodeId);
      const targetPort = targetNode?.ports.find(port => port.id === draft.target.portId);
      if (targetNode && targetPort) {
        end = this.getPortAnchor(targetNode, targetPort);
      }
    }

    if (!end) {
      end = draft.current;
    }

    const deltaX = end.x - start.x;
    const direction = deltaX >= 0 ? 1 : -1;
    const control = Math.max(this.options.connectionMinControlDistance, Math.abs(deltaX) / 2);
    const cp1x = start.x + control * direction;
    const cp2x = end.x - control * direction;
    const path = `M ${start.x} ${start.y} C ${cp1x} ${start.y} ${cp2x} ${end.y} ${end.x} ${end.y}`;

    this.draftPath
      .style('visibility', 'visible')
      .attr('stroke', draft.target ? this.options.theme.connection : this.options.theme.draft)
      .attr('d', path);

    this.updateDraftIndicators();
  }

  private updateDraftIndicators(): void {
    const draft = this.draft;
    const portSelection = this.nodeLayer.selectAll<SVGGElement, unknown>('g.fg-node-port');
    portSelection.classed('is-draft-source', function () {
      if (!draft) return false;
      const element = this as SVGGElement;
      return (
        element.getAttribute('data-node-id') === draft.source.nodeId &&
        element.getAttribute('data-port-id') === draft.source.portId
      );
    });
    portSelection.classed('is-draft-target', function () {
      if (!draft || !draft.target) return false;
      const element = this as SVGGElement;
      return (
        element.getAttribute('data-node-id') === draft.target.nodeId &&
        element.getAttribute('data-port-id') === draft.target.portId
      );
    });

    portSelection.each((_, index, groups) => {
      const element = select(groups[index]);
      const circle = element.select<SVGCircleElement>('circle.fg-node-port-handle');
      if (circle.empty()) {
        return;
      }
      const nodeId = element.attr('data-node-id');
      const portId = element.attr('data-port-id');
      if (draft && draft.source.nodeId === nodeId && draft.source.portId === portId) {
        circle.attr('fill', this.options.theme.connectionSelected);
      } else if (draft && draft.target && draft.target.nodeId === nodeId && draft.target.portId === portId) {
        circle.attr('fill', this.options.theme.connection);
      } else {
        circle.attr('fill', this.options.theme.portFill);
      }
    });
  }

  private updateMiniMap(state: FlowGraphState<TNodeData>): void {
    if (!this.options.showMiniMap) {
      this.miniMapRoot.style('display', 'none');
      return;
    }
    if (!this.miniMapRoot || !this.miniMapNodesGroup) {
      return;
    }
    if (!state.nodes.length) {
      this.miniMapRoot.style('display', 'none');
      return;
    }

    this.miniMapRoot.style('display', 'block');

    const padding = DEFAULT_MINIMAP_PADDING;
    const { width: mapWidth, height: mapHeight } = this.options.miniMapSize;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of state.nodes) {
      const width = node.size?.width ?? this.options.nodeSize.width;
      const height = node.size?.height ?? this.options.nodeSize.height;
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + width);
      maxY = Math.max(maxY, node.position.y + height);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      this.miniMapRoot.style('display', 'none');
      return;
    }

    const boundsWidth = Math.max(1, maxX - minX);
    const boundsHeight = Math.max(1, maxY - minY);
    this.miniMapBounds = { minX, minY, width: boundsWidth, height: boundsHeight };

    const scaleX = (mapWidth - padding * 2) / boundsWidth;
    const scaleY = (mapHeight - padding * 2) / boundsHeight;
    this.miniMapScale = Math.max(0.001, Math.min(scaleX, scaleY));

    const nodesData = state.nodes.map(node => {
      const width = node.size?.width ?? this.options.nodeSize.width;
      const height = node.size?.height ?? this.options.nodeSize.height;
      return {
        id: node.id,
        x: (node.position.x - minX) * this.miniMapScale + padding,
        y: (node.position.y - minY) * this.miniMapScale + padding,
        width: Math.max(2, width * this.miniMapScale),
        height: Math.max(2, height * this.miniMapScale),
      };
    });

    const selection = this.miniMapNodesGroup
      .selectAll<SVGRectElement, (typeof nodesData)[number]>('rect')
      .data(nodesData, node => node.id);

    selection.exit().remove();

    const entered = selection
      .enter()
      .append('rect')
      .attr('rx', 2)
      .attr('ry', 2)
      .attr('stroke-width', 1);

    const merged = entered.merge(selection as Selection<SVGRectElement, (typeof nodesData)[number]>);
    merged
      .attr('x', node => node.x)
      .attr('y', node => node.y)
      .attr('width', node => node.width)
      .attr('height', node => node.height)
      .attr('fill', this.options.theme.nodeFill)
      .attr('fill-opacity', 0.55)
      .attr('stroke', this.options.theme.nodeStroke)
      .attr('stroke-opacity', 0.7);

    this.updateMiniMapViewport();
  }

  private updateMiniMapViewport(): void {
    if (!this.options.showMiniMap) {
      this.miniMapViewportRect.style('display', 'none');
      return;
    }
    if (!this.miniMapRoot || !this.miniMapViewportRect) {
      return;
    }
    if (this.miniMapBounds.width <= 0 || this.miniMapBounds.height <= 0) {
      this.miniMapViewportRect.style('display', 'none');
      return;
    }
    const containerRect = this.container.getBoundingClientRect();
    if (containerRect.width === 0 || containerRect.height === 0) {
      return;
    }

    const padding = DEFAULT_MINIMAP_PADDING;
    const { width: mapWidth, height: mapHeight } = this.options.miniMapSize;
    const viewWidth = containerRect.width / this.transform.k;
    const viewHeight = containerRect.height / this.transform.k;
    const viewX = -this.transform.x / this.transform.k;
    const viewY = -this.transform.y / this.transform.k;

    const rawX = (viewX - this.miniMapBounds.minX) * this.miniMapScale + padding;
    const rawY = (viewY - this.miniMapBounds.minY) * this.miniMapScale + padding;
    const rawWidth = Math.max(4, viewWidth * this.miniMapScale);
    const rawHeight = Math.max(4, viewHeight * this.miniMapScale);

    const maxX = mapWidth - padding - rawWidth;
    const maxY = mapHeight - padding - rawHeight;
    const clampedX = Math.max(padding, Math.min(rawX, maxX));
    const clampedY = Math.max(padding, Math.min(rawY, maxY));

    this.miniMapViewportRect
      .style('display', 'block')
      .attr('x', clampedX)
      .attr('y', clampedY)
      .attr('width', Math.min(rawWidth, mapWidth - padding * 2))
      .attr('height', Math.min(rawHeight, mapHeight - padding * 2))
      .attr('stroke', this.options.theme.connection);
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (!this.options.interactive) {
      return;
    }

    if (event.key === 'Escape') {
      let changed = false;
      if (this.draft) {
        this.draft = null;
        this.updateDraftPath();
        changed = true;
      }
      if (this.dragState) {
        this.dragState = null;
        changed = true;
      }
      if (changed) {
        this.detachGlobalListeners();
      }
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (this.selection.connectionId) {
        event.preventDefault();
        try {
          this.graph.removeConnection(this.selection.connectionId);
        } catch (error) {
          this.options.onConnectionError?.(error);
        }
        this.selection = { nodeId: null, connectionId: null };
        this.syncSelection();
        return;
      }

      if (this.selection.nodeId) {
        event.preventDefault();
        try {
          this.graph.removeNode(this.selection.nodeId);
        } catch (error) {
          this.options.onConnectionError?.(error);
        }
        this.selection = { nodeId: null, connectionId: null };
        this.syncSelection();
      }
    }
  }
}