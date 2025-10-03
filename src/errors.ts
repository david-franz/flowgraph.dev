export type FlowGraphErrorCode =
  | 'NODE_EXISTS'
  | 'NODE_NOT_FOUND'
  | 'PORT_NOT_FOUND'
  | 'PORT_DIRECTION_MISMATCH'
  | 'PORT_CONNECTION_LIMIT'
  | 'CONNECTION_EXISTS'
  | 'CONNECTION_NOT_FOUND'
  | 'GROUP_EXISTS'
  | 'GROUP_NOT_FOUND'
  | 'INVALID_STATE';

export class FlowGraphError extends Error {
  constructor(public readonly code: FlowGraphErrorCode, message: string) {
    super(message);
    this.name = 'FlowGraphError';
  }
}