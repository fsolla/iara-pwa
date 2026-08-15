import type { ThreadMessageLike } from "@assistant-ui/react";

/** Modelo interno dos itens da conversa. */
export type Item =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string }
  | { kind: "thinking"; id: string; text: string }
  | { kind: "tool"; id: string; toolName: string; args: unknown; output?: string }
  | {
      kind: "approval";
      id: string;
      requestId: string;
      tool: string;
      summary: string;
      timeoutSecs?: number;
      decision?: "approve" | "deny" | "always";
    };

export const APPROVAL_TOOL = "__approval__";

export function approvalArgs(item: Extract<Item, { kind: "approval" }>): Record<string, unknown> {
  return {
    requestId: item.requestId,
    tool: item.tool,
    summary: item.summary,
    timeoutSecs: item.timeoutSecs ?? null,
    decision: item.decision ?? null,
  };
}

type ToolPart = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: unknown;
  result?: { type: "tool-result"; toolCallId: string; result: unknown };
};

/** Converte item → mensagem do runtime (assistant-ui modela tool calls como
 *  partes dentro de uma mensagem de assistente, não como role próprio). */
export function itemToMessage(item: Item): ThreadMessageLike {
  switch (item.kind) {
    case "user":
      return { role: "user", content: [{ type: "text", text: item.text }] };
    case "thinking":
      return { role: "assistant", content: [{ type: "reasoning", text: item.text }] };
    case "assistant":
      return { role: "assistant", content: [{ type: "text", text: item.text }] };
    case "tool": {
      const part: ToolPart = {
        type: "tool-call",
        toolCallId: item.id,
        toolName: item.toolName,
        args: item.args,
        result:
          item.output !== undefined
            ? { type: "tool-result", toolCallId: item.id, result: item.output }
            : undefined,
      };
      return { role: "assistant", content: [part] } as unknown as ThreadMessageLike;
    }
    case "approval": {
      const part: ToolPart = {
        type: "tool-call",
        toolCallId: item.id,
        toolName: APPROVAL_TOOL,
        args: approvalArgs(item),
        result:
          item.decision !== undefined
            ? { type: "tool-result", toolCallId: item.id, result: item.decision }
            : undefined,
      };
      return { role: "assistant", content: [part] } as unknown as ThreadMessageLike;
    }
  }
}
