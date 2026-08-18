import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { WsClient } from "../../src/lib/ws";
import type { ChatEvent } from "../../src/lib/ws";
import {
  FakeWebSocket,
  installFakeTimers,
  installFakeWebSocket,
  instances,
  restoreWebSocket,
} from "../helpers/ws-test-utils";
import type { FakeTimers } from "../helpers/ws-test-utils";

const URL = "wss://gateway/ws/chat";
const PROTOCOLS = ["zeroclaw.v1"];

const PROTOCOL_FRAMES: Array<[string, ChatEvent]> = [
  [
    JSON.stringify({ type: "session_start", session_id: "s", resumed: true, message_count: 2 }),
    { type: "session_start", session_id: "s", resumed: true, message_count: 2 },
  ],
  [JSON.stringify({ type: "connected" }), { type: "connected" }],
  [JSON.stringify({ type: "chunk", content: "olá" }), { type: "chunk", content: "olá" }],
  [JSON.stringify({ type: "chunk_reset" }), { type: "chunk_reset" }],
  [JSON.stringify({ type: "thinking" }), { type: "thinking" }],
  [JSON.stringify({ type: "thinking", content: "r" }), { type: "thinking", content: "r" }],
  [
    JSON.stringify({ type: "tool_call", name: "create_event", args: { title: "x" } }),
    { type: "tool_call", name: "create_event", args: { title: "x" } },
  ],
  [
    JSON.stringify({ type: "tool_result", name: "create_event", output: "ok" }),
    { type: "tool_result", name: "create_event", output: "ok" },
  ],
  [JSON.stringify({ type: "done", full_response: "f", max_context_tokens: 1, input_tokens: 2, output_tokens: 3 }),
    { type: "done", full_response: "f", max_context_tokens: 1, input_tokens: 2, output_tokens: 3 }],
  [JSON.stringify({ type: "done" }), { type: "done" }],
  [JSON.stringify({ type: "error" }), { type: "error" }],
  [JSON.stringify({ type: "error", message: "m", code: "c" }), { type: "error", message: "m", code: "c" }],
  [
    JSON.stringify({ type: "approval_request", request_id: "r1", tool: "create_event" }),
    { type: "approval_request", request_id: "r1", tool: "create_event" },
  ],
  [
    JSON.stringify({ type: "approval_request", request_id: "r2", tool: "create_event", arguments_summary: "s", timeout_secs: 30 }),
    { type: "approval_request", request_id: "r2", tool: "create_event", arguments_summary: "s", timeout_secs: 30 },
  ],
  [JSON.stringify({ type: "aborted" }), { type: "aborted" }],
  [JSON.stringify({ type: "aborted", reason: "r" }), { type: "aborted", reason: "r" }],
  [JSON.stringify({ type: "history_trimmed" }), { type: "history_trimmed" }],
  [
    JSON.stringify({ type: "history_trimmed", dropped_messages: 3, kept_turns: 2 }),
    { type: "history_trimmed", dropped_messages: 3, kept_turns: 2 },
  ],
  [
    JSON.stringify({ type: "cron_result", job_id: "j", success: true }),
    { type: "cron_result", job_id: "j", success: true },
  ],
];

describe("WsClient", () => {
  let events: ChatEvent[];
  let statuses: string[];
  let client: WsClient;
  let fakeTimers: FakeTimers;

  beforeEach(() => {
    events = [];
    statuses = [];
    installFakeWebSocket();
    fakeTimers = installFakeTimers();
    client = new WsClient({
      url: URL,
      protocols: PROTOCOLS,
      onEvent: (ev) => events.push(ev),
      onStatus: (s) => statuses.push(s),
    });
  });

  afterEach(() => {
    restoreWebSocket();
    fakeTimers.restore();
  });

  describe("parse de frames (server → client)", () => {
    test("cada tipo do protocolo chega ao onEvent sem perder campos", () => {
      client.connect();
      for (const [raw] of PROTOCOL_FRAMES) {
        instances[0].emitMessage(raw);
      }
      expect(events).toEqual(PROTOCOL_FRAMES.map(([, expected]) => expected));
    });

    test("frame não-JSON é ignorado sem erro", () => {
      client.connect();
      instances[0].emitMessage("isto não é json");
      expect(events).toEqual([]);
    });

    test("frame JSON de tipo desconhecido chega ao onEvent sem crash", () => {
      client.connect();
      instances[0].emitMessage(JSON.stringify({ type: "tipo_futuro", extra: 1 }));
      expect(events).toEqual([{ type: "tipo_futuro", extra: 1 }] as unknown as ChatEvent[]);
    });
  });

  describe("envio (client → server)", () => {
    test("sendMessage envia frame message quando o socket está OPEN", () => {
      client.connect();
      const ws = instances[0];
      ws.readyState = FakeWebSocket.OPEN;
      client.sendMessage("olá");
      expect(ws.sent).toEqual([JSON.stringify({ type: "message", content: "olá" })]);
    });

    test("sendApproval envia frame approval_response com a decisão", () => {
      client.connect();
      const ws = instances[0];
      ws.readyState = FakeWebSocket.OPEN;
      client.sendApproval("r1", "approve");
      client.sendApproval("r2", "deny");
      client.sendApproval("r3", "always");
      expect(ws.sent).toEqual([
        JSON.stringify({ type: "approval_response", request_id: "r1", decision: "approve" }),
        JSON.stringify({ type: "approval_response", request_id: "r2", decision: "deny" }),
        JSON.stringify({ type: "approval_response", request_id: "r3", decision: "always" }),
      ]);
    });

    test("não envia quando o socket não está OPEN", () => {
      client.connect();
      const ws = instances[0];
      client.sendMessage("olá");
      client.sendApproval("r1", "approve");
      expect(ws.sent).toEqual([]);
    });

    test("não envia quando o socket está CLOSING ou CLOSED", () => {
      client.connect();
      const ws = instances[0];
      ws.readyState = FakeWebSocket.CLOSING;
      client.sendMessage("olá");
      ws.readyState = FakeWebSocket.CLOSED;
      client.sendApproval("r1", "deny");
      expect(ws.sent).toEqual([]);
    });

    test("enviar antes de conectar não cria socket nem lança erro", () => {
      client.sendMessage("olá");
      client.sendApproval("r1", "approve");
      expect(instances).toEqual([]);
    });
  });

  describe("reconexão com backoff", () => {
    test("close não intencional agenda reconnect após 1000ms e reconstroi o socket", () => {
      client.connect();
      instances[0].close();
      expect(statuses).toEqual(["connecting", "reconnecting"]);
      expect(instances.length).toBe(1);
      fakeTimers.advance(999);
      expect(instances.length).toBe(1);
      fakeTimers.advance(1);
      expect(instances.length).toBe(2);
      expect(instances[1].url).toBe(URL);
      expect(instances[1].protocols).toEqual(PROTOCOLS);
    });

    test("delay dobra a cada tentativa até o cap de 30s", () => {
      client.connect();
      instances[0].close();
      fakeTimers.advance(1000);
      instances[1].close();
      fakeTimers.advance(2000);
      instances[2].close();
      fakeTimers.advance(4000);
      instances[3].close();
      fakeTimers.advance(8000);
      instances[4].close();
      fakeTimers.advance(16000);
      instances[5].close();
      fakeTimers.advance(29999);
      expect(instances.length).toBe(6);
      fakeTimers.advance(1);
      expect(instances.length).toBe(7);
    });

    test("onopen reseta o delay para 1000 (não no connect)", () => {
      client.connect();
      instances[0].close();
      fakeTimers.advance(1000);
      instances[1].close();
      fakeTimers.advance(1000);
      expect(instances.length).toBe(2);
      fakeTimers.advance(1000);
      expect(instances.length).toBe(3);
      instances[2].emitOpen();
      instances[2].close();
      fakeTimers.advance(1000);
      expect(instances.length).toBe(4);
    });
  });

  describe("disconnect", () => {
    test("close intencional emite closed e não reconecta", () => {
      client.connect();
      const ws = instances[0];
      ws.readyState = FakeWebSocket.OPEN;
      client.disconnect();
      expect(statuses).toEqual(["connecting", "closed"]);
      fakeTimers.advance(10000);
      expect(instances.length).toBe(1);
    });

    test("disconnect durante o backoff limpa o timer pendente", () => {
      client.connect();
      instances[0].close();
      client.disconnect();
      fakeTimers.advance(10000);
      expect(instances.length).toBe(1);
    });
  });

  describe("transições de status", () => {
    test("connecting → open quando o socket abre", () => {
      client.connect();
      expect(statuses).toEqual(["connecting"]);
      instances[0].emitOpen();
      expect(statuses).toEqual(["connecting", "open"]);
    });

    test("connecting → reconnecting → connecting → open", () => {
      client.connect();
      instances[0].close();
      fakeTimers.advance(1000);
      instances[1].emitOpen();
      expect(statuses).toEqual(["connecting", "reconnecting", "connecting", "open"]);
    });

    test("erro fecha o socket e dispara reconexão", () => {
      client.connect();
      instances[0].onerror?.();
      expect(statuses).toEqual(["connecting", "reconnecting"]);
      fakeTimers.advance(1000);
      expect(instances.length).toBe(2);
    });
  });
});
