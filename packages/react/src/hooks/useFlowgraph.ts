import { useEffect, useMemo, useState } from 'react';
import { FlowGraph, type FlowGraphOptions, type FlowGraphState } from '@flowtomic/flowgraph';

export interface UseFlowgraphOptions<TNodeData extends Record<string, unknown> = Record<string, unknown>> {
  /** Optional existing graph instance to re-use. */
  graph?: FlowGraph<TNodeData>;
  /** Initial state applied when a new graph instance is created. */
  initialState?: FlowGraphState<TNodeData>;
  /** Forwarded to the FlowGraph constructor. */
  graphOptions?: FlowGraphOptions<TNodeData>;
}

export interface UseFlowgraphResult<TNodeData extends Record<string, unknown> = Record<string, unknown>> {
  graph: FlowGraph<TNodeData>;
  state: FlowGraphState<TNodeData>;
}

export const useFlowgraph = <TNodeData extends Record<string, unknown> = Record<string, unknown>>(
  options: UseFlowgraphOptions<TNodeData> = {},
): UseFlowgraphResult<TNodeData> => {
  const { graph: providedGraph, initialState, graphOptions } = options;

  const graph = useMemo(() => {
    if (providedGraph) {
      return providedGraph;
    }
    const mergedOptions: FlowGraphOptions<TNodeData> = {
      ...graphOptions,
    };
    if (initialState && !graphOptions?.initialState) {
      mergedOptions.initialState = initialState;
    }
    return new FlowGraph<TNodeData>(mergedOptions);
  }, [providedGraph, graphOptions, initialState]);

  const [state, setState] = useState<FlowGraphState<TNodeData>>(() => graph.getState());

  useEffect(() => {
    const unsubscribe = graph.subscribe(event => setState(event.state));
    return unsubscribe;
  }, [graph]);

  return { graph, state };
};