import type { FlowGraphState } from './types.js';
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
export declare const buildNavigatorSummary: <TNodeData>(state: FlowGraphState<TNodeData>) => FlowGraphNavigatorSummary;
//# sourceMappingURL=navigator.d.ts.map