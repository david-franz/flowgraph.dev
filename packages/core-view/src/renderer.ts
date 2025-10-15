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
  /** Background color applied to the SVG canvas. */
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
  /** Allow pointer interactions (drag, zoom). Default true. */
  interactive?: boolean;
  /** Sync viewport changes back to FlowGraph.setViewport. Default true. */
  syncViewport?: boolean;
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

const DEFAULT_OPTIONS: Required<Pick<FlowgraphRendererOptions, 'background' | 'nodeSize' | 'nodeCornerRadius' | 'portSpacing' | 'portRegionPadding' | 'connectionMinControlDistance' | 'interactive' | 'syncViewport'>> = {
  background: '#0f172a',
  nodeSize: { width: 220, height: 160 },
  nodeCornerRadius: 16,
  portSpacing: 28,
  portRegionPadding: 52,
  connectionMinControlDistance: 80,
  interactive: true,
  syncViewport: true,
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
  background: string;
  nodeSize: { width: number; height: number };
  nodeCornerRadius: number;
  portSpacing: number;
  portRegionPadding: number;
  connectionMinControlDistance: number;
  interactive: boolean;
  syncViewport: boolean;
  onNodeSelect?: (node: GraphNode<TNodeData>) => void;
  onConnectionSelect?: (connection: GraphConnection) => void;
  onViewportChange?: (viewport: FlowgraphRendererViewport) => void;
  onConnectionCreate?: (connection: GraphConnection) => void;
  onConnectionError?: (error: unknown) => void;
  initialSelection: FlowgraphRendererSelection | null;
}

export class FlowgraphRenderer<TNodeData extends Record<string, unknown> = Record<string, unknown>> {
  private readonly container: HTMLElement;
  private readonly graph: FlowGraph<TNodeData>;
  private readonly svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private readonly background: Selection<SVGRectElement, unknown, null, undefined>;
  private readonly scene: Selection<SVGGElement, unknown, null, undefined>;
  private readonly connectionLayer: Selection<SVGGElement, unknown, null, undefined>;
  private readonly draftPath: Selection<SVGPathElement, unknown, null, undefined>;
  private readonly nodeLayer: Selection<SVGGElement, unknown, null, undefined>;
  private readonly zoomBehavior: ZoomBehavior<SVGSVGElement, unknown>;

  private selection: FlowgraphRendererSelection = {};
  private options: FlowgraphRendererResolvedOptions<TNodeData>;
  private dragState: DragState | null = null;
  private draft: ConnectionDraft | null = null;
  private unsubscribe?: () => void;
  private transform: ZoomTransform = zoomIdentity;
  private suppressViewportEmit = false;
  private applyingViewport = false;

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
      .attr('fill', this.options.background)
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('pointer-events', 'all');

    const defs = this.svg.append('defs');
    this.createDefs(defs);

    this.scene = this.svg.append('g').attr('class', 'fg-scene');
    this.connectionLayer = this.scene.append('g').attr('class', 'fg-layer fg-layer--connections');
    this.draftPath = this.connectionLayer
      .append('path')
      .attr('class', 'fg-connection fg-connection--draft')
      .attr('fill', 'none')
      .attr('stroke', '#475569')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '8 6')
      .attr('pointer-events', 'none')
      .style('opacity', 0.9)
      .style('visibility', 'hidden');
    this.nodeLayer = this.scene.append('g').attr('class', 'fg-layer fg-layer--nodes');

    this.zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 2.5])
      .on('start', event => this.handleZoomStart(event))
      .on('zoom', event => this.handleZoom(event.transform))
      .on('end', () => this.handleZoomEnd());

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
    window.removeEventListener('keydown', this.keydownHandler);
  }

  updateOptions(patch: Partial<FlowgraphRendererOptions<TNodeData>>): void {
    const next: FlowgraphRendererOptions<TNodeData> = { ...this.options, ...patch };
    if (patch.nodeSize) {
      next.nodeSize = { ...patch.nodeSize };
    }
    this.options = this.mergeOptions(next);
    this.applyVisualOptions();
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
    return {
      width: options.width,
      height: options.height,
      background: options.background ?? DEFAULT_OPTIONS.background,
      nodeSize: { ...DEFAULT_OPTIONS.nodeSize, ...(options.nodeSize ?? {}) },
      nodeCornerRadius: options.nodeCornerRadius ?? DEFAULT_OPTIONS.nodeCornerRadius,
      portSpacing: options.portSpacing ?? DEFAULT_OPTIONS.portSpacing,
      portRegionPadding: options.portRegionPadding ?? DEFAULT_OPTIONS.portRegionPadding,
      connectionMinControlDistance:
        options.connectionMinControlDistance ?? DEFAULT_OPTIONS.connectionMinControlDistance,
      interactive: options.interactive ?? DEFAULT_OPTIONS.interactive,
      syncViewport: options.syncViewport ?? DEFAULT_OPTIONS.syncViewport,
      onNodeSelect: options.onNodeSelect,
      onConnectionSelect: options.onConnectionSelect,
      onViewportChange: options.onViewportChange,
      onConnectionCreate: options.onConnectionCreate,
      onConnectionError: options.onConnectionError,
      initialSelection: options.initialSelection ?? null,
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
    this.background.attr('fill', this.options.background);
  }

  private updateInteractivity(): void {
    if (this.options.interactive) {
      this.svg.call(this.zoomBehavior);
      this.svg.on('dblclick.zoom', null);
      this.svg.style('cursor', 'grab');
      this.background.attr('pointer-events', 'all');
    } else {
      this.svg.on('.zoom', null);
      this.svg.style('cursor', 'default');
      this.background.attr('pointer-events', 'none');
    }
  }

  private configureZoomFilter(): void {
    this.zoomBehavior.filter((event: any) => this.shouldAllowZoom(event));
  }

  private shouldAllowZoom(event: any): boolean {
    if (!this.options.interactive) {
      return false;
    }
    const target = event?.target instanceof Element ? (event.target as Element) : null;
    if (!target) {
      return true;
    }
    const type = typeof event?.type === 'string' ? event.type : '';
    if (type.startsWith('pointer')) {
      if (target.closest('g.fg-node') || target.closest('g.fg-node-port')) {
        return false;
      }
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

  private createDefs(defs: Selection<SVGDefsElement, unknown, null, undefined>): void {
    const marker = defs
      .append('marker')
      .attr('id', 'fg-arrow')
      .attr('viewBox', '0 0 12 12')
      .attr('refX', 10)
      .attr('refY', 6)
      .attr('markerWidth', 12)
      .attr('markerHeight', 12)
      .attr('orient', 'auto-start-reverse')
      .attr('markerUnits', 'userSpaceOnUse');

    marker
      .append('path')
      .attr('d', 'M2,2 L10,6 L2,10')
      .attr('fill', 'none')
      .attr('stroke', '#38bdf8')
      .attr('stroke-width', 1.5);
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
      .attr('cursor', this.options.interactive ? 'grab' : 'default')
      .on('pointerdown', (event, node) => this.handleNodePointerDown(event as PointerEvent, node))
      .on('dblclick', (event, node) => this.handleNodeDoubleClick(event as PointerEvent, node));

    entered
      .append('rect')
      .attr('class', 'fg-node-body')
      .attr('width', this.options.nodeSize.width)
      .attr('height', this.options.nodeSize.height)
      .attr('rx', this.options.nodeCornerRadius)
      .attr('ry', this.options.nodeCornerRadius)
      .attr('fill', '#1e293b')
      .attr('stroke', '#334155')
      .attr('stroke-width', 1.5);

    entered
      .append('text')
      .attr('class', 'fg-node-label')
      .attr('x', 16)
      .attr('y', 26)
      .attr('fill', '#e2e8f0')
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
      .attr('cursor', this.options.interactive ? 'grab' : 'default');

    merged
      .select<SVGRectElement>('rect.fg-node-body')
      .attr('width', this.options.nodeSize.width)
      .attr('height', this.options.nodeSize.height)
      .attr('rx', this.options.nodeCornerRadius)
      .attr('ry', this.options.nodeCornerRadius);

    merged
      .select<SVGTextElement>('text.fg-node-label')
      .text(node => node.label ?? node.id);

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
      .attr('fill', '#38bdf8');

    inputEnter
      .append('text')
      .attr('class', 'fg-node-port-label')
      .attr('x', 0)
      .attr('y', 4)
      .attr('fill', '#cbd5f5')
      .attr('font-size', 12)
      .attr('font-family', 'sans-serif')
      .text(port => port.label ?? port.id);

    const inputMerged = inputEnter.merge(inputSelection);
    inputMerged
      .attr('transform', (_port, idx) => this.getPortTransform(idx, 'input'))
      .attr('data-node-id', node.id)
      .attr('data-port-direction', 'input')
      .attr('data-port-id', port => port.id);

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
      .attr('fill', '#cbd5f5')
      .attr('font-size', 12)
      .attr('font-family', 'sans-serif')
      .text(port => port.label ?? port.id);

    outputEnter
      .append('circle')
      .attr('class', 'fg-node-port-handle')
      .attr('r', 5)
      .attr('cx', this.options.nodeSize.width + 10)
      .attr('cy', 0)
      .attr('fill', '#38bdf8');

    const outputMerged = outputEnter.merge(outputSelection);
    outputMerged
      .attr('transform', (_port, idx) => this.getPortTransform(idx, 'output'))
      .select<SVGTextElement>('text.fg-node-port-label')
      .attr('x', this.options.nodeSize.width - 60);

    outputMerged
      .select<SVGCircleElement>('circle.fg-node-port-handle')
      .attr('cx', this.options.nodeSize.width + 10);

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
      .attr('stroke', '#38bdf8')
      .attr('stroke-width', 2)
      .attr('marker-end', 'url(#fg-arrow)')
      .attr('opacity', 0.92)
      .on('pointerdown', (event, connection) => this.handleConnectionPointerDown(event as PointerEvent, connection))
      .on('dblclick', (event, connection) => this.handleConnectionDoubleClick(event as PointerEvent, connection));

    const merged = entered.merge(selection as Selection<SVGPathElement, GraphConnection>);

    merged.attr('d', connection => this.getConnectionPath(connection, nodeLookup));
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
  }

  private handleZoomStart(event: D3ZoomEvent<SVGSVGElement, unknown>): void {
    if (!this.options.interactive) {
      return;
    }
    const sourceEvent = event.sourceEvent;
    if (sourceEvent instanceof PointerEvent && sourceEvent.buttons === 1) {
      this.svg.style('cursor', 'grabbing');
    }
  }

  private handleZoomEnd(): void {
    if (!this.options.interactive) {
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
    const element = event.currentTarget as SVGGraphicsElement | null;
    element?.setPointerCapture?.(event.pointerId);
    this.selection = { nodeId: node.id, connectionId: null };
    this.options.onNodeSelect?.(node);
    this.syncSelection();

    this.dragState = {
      nodeId: node.id,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      startX: node.position.x,
      startY: node.position.y,
      element,
    };

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
      const nextX = this.dragState.startX + deltaX;
      const nextY = this.dragState.startY + deltaY;
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
      this.updateDraftPath();
      this.syncSelection();
    }

    if (!this.dragState && !this.draft) {
      if (this.options.interactive) {
        this.svg.style('cursor', 'grab');
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
      .attr('stroke', connection => (connection.id === connectionId ? '#f8fafc' : '#38bdf8'))
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
      .attr('stroke', draft.target ? '#38bdf8' : '#475569')
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