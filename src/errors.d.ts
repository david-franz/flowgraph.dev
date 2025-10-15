export type FlowGraphErrorCode = 'NODE_EXISTS' | 'NODE_NOT_FOUND' | 'PORT_NOT_FOUND' | 'PORT_DIRECTION_MISMATCH' | 'PORT_CONNECTION_LIMIT' | 'PORT_COLOR_MISMATCH' | 'CONNECTION_EXISTS' | 'CONNECTION_NOT_FOUND' | 'GROUP_EXISTS' | 'GROUP_NOT_FOUND' | 'TEMPLATE_EXISTS' | 'TEMPLATE_NOT_FOUND' | 'INVALID_STATE';
export declare class FlowGraphError extends Error {
    readonly code: FlowGraphErrorCode;
    constructor(code: FlowGraphErrorCode, message: string);
}
//# sourceMappingURL=errors.d.ts.map