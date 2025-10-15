export class FlowGraphError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'FlowGraphError';
    }
}
//# sourceMappingURL=errors.js.map