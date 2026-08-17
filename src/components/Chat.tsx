import { useEffect, useMemo, useRef, useState } from "react";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  TextMessagePartProvider,
  ThreadPrimitive,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";

import { ApprovalCard } from "./ApprovalCard";
import { itemToMessage, type Item } from "../lib/messages";
import { loadSettings, type Settings } from "../lib/settings";
import { recordAudio, speak, transcribe } from "../lib/voice";
import { WsClient, type ApprovalDecision, type ChatEvent } from "../lib/ws";

function nextId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface ChatProps {
  onEditSettings: () => void;
}

export function Chat({ onEditSettings }: ChatProps) {
  const settings = loadSettings();
  const wsRef = useRef<WsClient | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<"connecting" | "open" | "closed" | "reconnecting">("connecting");
  const [recording, setRecording] = useState(false);
  const [voiceOut, setVoiceOut] = useState(false);
  const voiceOutRef = useRef(voiceOut);
  voiceOutRef.current = voiceOut;
  const stopRecordingRef = useRef<(() => void) | null>(null);

  const handleEvent = (ev: ChatEvent, s: Settings) => {
    switch (ev.type) {
      case "chunk":
        setItems((prev) => {
          const last = prev[prev.length - 1];
          if (last?.kind === "assistant") {
            return [...prev.slice(0, -1), { ...last, text: last.text + (ev.content ?? "") }];
          }
          return [...prev, { kind: "assistant", id: nextId(), text: ev.content ?? "" }];
        });
        break;
      case "chunk_reset":
        setItems((prev) =>
          prev[prev.length - 1]?.kind === "assistant" ? prev.slice(0, -1) : prev,
        );
        break;
      case "thinking":
        setItems((prev) => [
          ...prev.filter((i) => i.kind !== "thinking"),
          { kind: "thinking", id: nextId(), text: ev.content ?? "" },
        ]);
        break;
      case "tool_call":
        setItems((prev) => [
          ...prev.filter((i) => i.kind !== "thinking"),
          { kind: "tool", id: nextId(), toolName: ev.name, args: ev.args },
        ]);
        break;
      case "tool_result":
        setItems((prev) => {
          const idx = [...prev].reverse().findIndex((i) => i.kind === "tool");
          if (idx < 0) return prev;
          const i = prev.length - 1 - idx;
          const t = prev[i] as Extract<Item, { kind: "tool" }>;
          return [...prev.slice(0, i), { ...t, output: ev.output }, ...prev.slice(i + 1)];
        });
        break;
      case "done": {
        setItems((prev) => {
          const last = prev[prev.length - 1];
          const text = ev.full_response ?? (last?.kind === "assistant" ? last.text : "");
          if (s.ttsUrl && voiceOutRef.current && text) {
            speak(s.ttsUrl, text).catch(() => {});
          }
          if (last?.kind === "assistant") return [...prev.slice(0, -1), { ...last, text }];
          if (text) return [...prev, { kind: "assistant", id: nextId(), text }];
          return prev;
        });
        setRunning(false);
        break;
      }
      case "approval_request":
        setItems((prev) => [
          ...prev,
          {
            kind: "approval",
            id: nextId(),
            requestId: ev.request_id,
            tool: ev.tool,
            summary: ev.arguments_summary ?? "",
            timeoutSecs: ev.timeout_secs,
          },
        ]);
        setRunning(false);
        break;
      case "error":
        setItems((prev) => [
          ...prev,
          {
            kind: "assistant",
            id: nextId(),
            text: `Erro: ${ev.message ?? ev.code ?? "desconhecido"}`,
          },
        ]);
        setRunning(false);
        break;
      case "aborted":
        setRunning(false);
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    const ws = new WsClient({
      url: wsUrlOf(settings),
      protocols: ["zeroclaw.v1", `bearer.${settings.token}`],
      onStatus: setStatus,
      onEvent: (ev) => handleEvent(ev, settings),
    });
    wsRef.current = ws;
    ws.connect();
    return () => ws.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApproval = (requestId: string, decision: ApprovalDecision) => {
    wsRef.current?.sendApproval(requestId, decision);
    setItems((prev) =>
      prev.map((i) => (i.kind === "approval" && i.requestId === requestId ? { ...i, decision } : i)),
    );
  };

  const sendText = (text: string) => {
    setItems((prev) => [...prev, { kind: "user", id: nextId(), text }]);
    setRunning(true);
    wsRef.current?.sendMessage(text);
  };

  const toggleMic = () => {
    if (recording) {
      stopRecordingRef.current?.();
      setRecording(false);
      return;
    }
    if (!settings.sttUrl) {
      setItems((prev) => [
        ...prev,
        {
          kind: "assistant",
          id: nextId(),
          text: "Configure a URL de STT (voz → texto) nas configurações para usar o microfone.",
        },
      ]);
      return;
    }
    setRecording(true);
    stopRecordingRef.current = recordAudio(
      async (blob) => {
        setRecording(false);
        try {
          const text = await transcribe(settings.sttUrl, blob);
          if (text) sendText(text);
        } catch (err) {
          setItems((prev) => [
            ...prev,
            { kind: "assistant", id: nextId(), text: `Falha na transcrição: ${String(err)}` },
          ]);
        }
      },
      (err) => {
        setRecording(false);
        setItems((prev) => [
          ...prev,
          { kind: "assistant", id: nextId(), text: `Microfone indisponível: ${String(err)}` },
        ]);
      },
    );
  };

  const messages = useMemo(() => items.map(itemToMessage), [items]);

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: running,
    convertMessage: (m) => m,
    onNew: async (message) => {
      const text = message.content
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("")
        .trim();
      if (!text) return;
      sendText(text);
    },
  });

  const statusLabel =
    status === "open"
      ? "conectado"
      : status === "connecting"
        ? "conectando…"
        : status === "reconnecting"
          ? "reconectando…"
          : "desconectado";

  const renderItem = (item: Item) => {
    if (item.kind === "user") {
      return (
        <div key={item.id} className="flex justify-end">
          <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-teal-800 px-3 py-2 text-sm text-teal-50">
            {item.text}
          </div>
        </div>
      );
    }
    if (item.kind === "thinking") {
      return (
        <details key={item.id} className="text-xs text-slate-500">
          <summary>Raciocínio</summary>
          <p className="mt-1 whitespace-pre-wrap">{item.text}</p>
        </details>
      );
    }
    if (item.kind === "tool") {
      return (
        <div
          key={item.id}
          className="my-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[11px] text-slate-400"
        >
          ⚙ {item.toolName}
          {item.output !== undefined && <span className="text-teal-400"> ✓</span>}
        </div>
      );
    }
    if (item.kind === "approval") {
      return (
        <div key={item.id}>
          <ApprovalCard
            tool={item.tool}
            summary={item.summary}
            timeoutSecs={item.timeoutSecs}
            decision={item.decision}
            onDecision={(d) => handleApproval(item.requestId, d)}
          />
        </div>
      );
    }
    return (
      <div key={item.id} className="flex justify-start">
        <TextMessagePartProvider text={item.text} isRunning={running}>
          <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-800 px-3 py-2 text-sm text-slate-100">
            <MarkdownTextPrimitive remarkPlugins={[remarkGfm]} className="aui-md" smooth={false} />
          </div>
        </TextMessagePartProvider>
      </div>
    );
  };

  return (
    <div className="mx-auto flex h-dvh max-w-3xl flex-col">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-teal-300">Iara</span>
          <span
            className={`h-2 w-2 rounded-full ${status === "open" ? "bg-emerald-400" : "bg-slate-600"}`}
            title={statusLabel}
          />
          <span className="text-xs text-slate-500">{statusLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className={`rounded px-2 py-1 text-xs font-medium ${
              voiceOut ? "bg-teal-700 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
            onClick={() => setVoiceOut((v) => !v)}
            title="Ler respostas em voz alta (requer URL de TTS)"
          >
            🔊
          </button>
          <button
            className="rounded bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700"
            onClick={onEditSettings}
          >
            Configurações
          </button>
        </div>
      </header>

      <AssistantRuntimeProvider runtime={runtime}>
        <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
          <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {items.length === 0 && (
              <div className="flex h-full items-center justify-center text-sm text-slate-600">
                Fale com a Iara — pergunte, peça para criar eventos, tarefas, notas e e-mails.
              </div>
            )}
            <div className="space-y-3">{items.map(renderItem)}</div>
          </ThreadPrimitive.Viewport>

          <footer className="border-t border-slate-800 px-4 py-2">
            <ComposerPrimitive.Root className="flex items-center gap-2">
              <ComposerPrimitive.Input
                placeholder="Escreva sua mensagem…"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-teal-600"
              />
              <ComposerPrimitive.Send asChild disabled={status !== "open"}>
                <button
                  className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-40"
                  title="Enviar"
                >
                  Enviar
                </button>
              </ComposerPrimitive.Send>
              <button
                className={`flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium ${
                  recording
                    ? "bg-red-600 text-white"
                    : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                }`}
                onClick={toggleMic}
                title="Falar com a Iara (requer URL de STT)"
              >
                {recording ? "● Gravando" : "🎙"}
              </button>
            </ComposerPrimitive.Root>
          </footer>
        </ThreadPrimitive.Root>
      </AssistantRuntimeProvider>
    </div>
  );
}

function wsUrlOf(s: Settings): string {
  const base = s.gatewayUrl.trim().replace(/\/+$/, "");
  const params = new URLSearchParams({ agent: s.agent.trim() || "main" });
  const name = s.sessionName.trim();
  if (name) params.set("name", name);
  if (s.token.trim()) params.set("token", s.token.trim());
  return `${base}?${params.toString()}`;
}
