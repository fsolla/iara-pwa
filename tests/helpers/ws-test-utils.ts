export class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readonly protocols: string[];
  readonly sent: string[] = [];
  readyState: number = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string, protocols: string[]) {
    this.url = url;
    this.protocols = protocols;
    instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    if (this.readyState === FakeWebSocket.CLOSING || this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  emitOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  emitMessage(data: string): void {
    this.onmessage?.({ data });
  }
}

export const instances: FakeWebSocket[] = [];

const originalWebSocket = globalThis.WebSocket;

export function installFakeWebSocket(): void {
  instances.length = 0;
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
}

export function restoreWebSocket(): void {
  globalThis.WebSocket = originalWebSocket;
}

export interface FakeTimers {
  advance(ms: number): void;
  restore(): void;
}

export function installFakeTimers(): FakeTimers {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { callback: () => void; fireAt: number }>();

  globalThis.setTimeout = ((callback: () => void, ms = 0) => {
    const id = nextId++;
    pending.set(id, { callback, fireAt: now + ms });
    return id;
  }) as typeof setTimeout;

  globalThis.clearTimeout = ((id: number | undefined) => {
    if (id !== undefined) pending.delete(id);
  }) as typeof clearTimeout;

  return {
    advance(ms: number): void {
      now += ms;
      for (;;) {
        const due = [...pending.entries()].filter(([, t]) => t.fireAt <= now);
        if (due.length === 0) break;
        for (const [id, t] of due) {
          if (pending.has(id)) {
            pending.delete(id);
            t.callback();
          }
        }
      }
    },
    restore(): void {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    },
  };
}
