import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { CSSProperties, Ref, ReactElement } from 'react';
import type { FlowGraph } from '@flowtomic/flowgraph';
import {
  FlowgraphRenderer,
  type FlowgraphRendererOptions,
  type FlowgraphRendererSelection,
  type FlowgraphRendererViewport,
} from '@flowtomic/flowgraph-core-view';

export interface FlowCanvasHandle<TNodeData extends Record<string, unknown> = Record<string, unknown>> {
  getRenderer: () => FlowgraphRenderer<TNodeData> | null;
  getViewport: () => FlowgraphRendererViewport | null;
}

export interface FlowCanvasProps<TNodeData extends Record<string, unknown> = Record<string, unknown>> {
  graph: FlowGraph<TNodeData>;
  className?: string;
  style?: CSSProperties;
  rendererOptions?: FlowgraphRendererOptions<TNodeData>;
  selection?: FlowgraphRendererSelection | null;
  onRendererReady?: (renderer: FlowgraphRenderer<TNodeData>) => void;
}

const FlowCanvasComponent = <TNodeData extends Record<string, unknown>>(
  props: FlowCanvasProps<TNodeData>,
  ref: Ref<FlowCanvasHandle<TNodeData> | null>,
) => {
  const { graph, className, style, rendererOptions, selection, onRendererReady } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<FlowgraphRenderer<TNodeData> | null>(null);
  const lastSelectionRef = useRef<FlowgraphRendererSelection | null>(null);
  const readyCallbackRef = useRef<((renderer: FlowgraphRenderer<TNodeData>) => void) | undefined>();

  useEffect(() => {
    readyCallbackRef.current = onRendererReady;
  }, [onRendererReady]);

  useImperativeHandle(ref, () => ({
    getRenderer: () => rendererRef.current,
    getViewport: () => rendererRef.current?.getViewport() ?? null,
  }), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const renderer = new FlowgraphRenderer<TNodeData>(container, graph, rendererOptions ?? {});
    rendererRef.current = renderer;
    lastSelectionRef.current = renderer.getSelection();
    readyCallbackRef.current?.(renderer);

    return () => {
      renderer.destroy();
      rendererRef.current = null;
      lastSelectionRef.current = null;
    };
  }, [graph]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !rendererOptions) {
      return;
    }
    renderer.updateOptions(rendererOptions);
  }, [rendererOptions]);

  useEffect(() => {
    if (selection === undefined) {
      return;
    }
    const renderer = rendererRef.current;
    if (!renderer) {
      return;
    }
    const nextSelection = selection ?? { nodeId: null, connectionId: null };
    if (
      !lastSelectionRef.current ||
      lastSelectionRef.current.nodeId !== nextSelection.nodeId ||
      lastSelectionRef.current.connectionId !== nextSelection.connectionId
    ) {
      renderer.setSelection(nextSelection);
      lastSelectionRef.current = nextSelection;
    }
  }, [selection]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: '100%', position: 'relative', ...style }}
    />
  );
};

export const FlowCanvas = forwardRef(FlowCanvasComponent) as <
  TNodeData extends Record<string, unknown> = Record<string, unknown>,
>(
  props: FlowCanvasProps<TNodeData> & { ref?: Ref<FlowCanvasHandle<TNodeData> | null> },
) => ReactElement;

export type { FlowCanvasProps as FlowCanvasComponentProps };