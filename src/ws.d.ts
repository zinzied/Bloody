// Minimal ambient declaration for 'ws' to satisfy TypeScript without @types/ws
declare module 'ws' {
  export class WebSocketServer extends NodeJS.EventEmitter {
    constructor(options: { noServer?: boolean; port?: number; host?: string; path?: string; clientTracking?: boolean; maxPayload?: number });
    clients: Set<WebSocket>;
    handleUpgrade(req: any, socket: any, head: Buffer, callback: (ws: WebSocket) => void): void;
    close(cb?: () => void): void;
    emit(event: 'connection', ws: WebSocket, req: any): boolean;
    emit(event: string, ...args: any[]): boolean;
    on(event: 'connection', listener: (ws: WebSocket, req: any) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'headers' | 'listening', listener: () => void): this;
  }

  export class WebSocket extends NodeJS.EventEmitter {
    readyState: number;
    send(data: string | Buffer, cb?: (err?: Error) => void): void;
    close(code?: number, reason?: string): void;
    on(event: 'open' | 'close' | 'error' | 'message', listener: (...args: any[]) => void): this;
    static OPEN: 1;
    static CLOSED: 3;
  }
}