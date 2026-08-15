/** Cliente WebSocket do protocolo de chat do gateway (ZeroClaw e compatíveis).
 *
 *  Protocolo (server → client):
 *    session_start, chunk, chunk_reset, thinking, tool_call, tool_result,
 *    done, error, approval_request, aborted, history_trimmed, connected
 *  Protocolo (client → server):
 *    message, approval_response
 */

export type ChatEvent =
  | { type: "session_start"; session_id: string; resumed: boolean; message_count: number }
  | { type: "connected" }
  | { type: "chunk"; content: string }
  | { type: "chunk_reset" }
  | { type: "thinking"; content?: string }
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "tool_result"; name: string; output: string }
  | { type: "done"; full_response?: string; max_context_tokens?: number; input_tokens?: number; output_tokens?: number }
  | { type: "error"; message?: string; code?: string }
  | {
      type: "approval_request";
      request_id: string;
      tool: string;
      arguments_summary?: string;
      timeout_secs?: number;
    }
  | { type: "aborted"; reason?: string }
  | { type: "history_trimmed"; dropped_messages?: number; kept_turns?: number }
  | { type: "cron_result"; job_id?: string; success?: boolean };

export type ApprovalDecision = "approve" | "deny" | "always";

export interface WsClientOptions {
  url: string;
  protocols?: string[];
  onEvent: (ev: ChatEvent) => void;
  onStatus?: (status: "connecting" | "open" | "closed" | "reconnecting") => void;
}

export class WsClient {
  private ws: WebSocket | null = null;
  private url: string;
  private protocols: string[];
  private onEvent: (ev: ChatEvent) => void;
  private onStatus?: (status: "connecting" | "open" | "closed" | "reconnecting") => void;
  private intentional = false;
  private delay = 1000;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: WsClientOptions) {
    this.url = opts.url;
    this.protocols = opts.protocols ?? [];
    this.onEvent = opts.onEvent;
    this.onStatus = opts.onStatus;
  }

  connect(): void {
    this.intentional = false;
    this.onStatus?.("connecting");
    this.ws = new WebSocket(this.url, this.protocols);
    this.ws.onmessage = (ev) => {
      try {
        this.onEvent(JSON.parse(ev.data) as ChatEvent);
      } catch {
        // ignora frames não-JSON
      }
    };
    this.ws.onopen = () => {
      this.delay = 1000;
      this.onStatus?.("open");
    };
    this.ws.onclose = () => {
      this.onStatus?.(this.intentional ? "closed" : "reconnecting");
      if (!this.intentional) {
        this.timer = setTimeout(() => this.connect(), this.delay);
        this.delay = Math.min(this.delay * 2, 30000);
      }
    };
    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  sendMessage(content: string): void {
    this.send({ type: "message", content });
  }

  sendApproval(requestId: string, decision: ApprovalDecision): void {
    this.send({ type: "approval_response", request_id: requestId, decision });
  }

  private send(obj: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(obj));
  }

  disconnect(): void {
    this.intentional = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
  }
}
