import { useEffect, useState } from "react";

import type { ApprovalDecision } from "../lib/ws";

export interface ApprovalCardProps {
  tool: string;
  summary: string;
  timeoutSecs?: number | null;
  decision?: ApprovalDecision | null;
  onDecision: (d: ApprovalDecision) => void;
}

export function ApprovalCard({ tool, summary, timeoutSecs, decision, onDecision }: ApprovalCardProps) {
  const [secondsLeft, setSecondsLeft] = useState<number>(timeoutSecs ?? 0);

  useEffect(() => {
    if (!timeoutSecs) return;
    const deadline = Date.now() + timeoutSecs * 1000;
    const t = setInterval(() => {
      const left = Math.round((deadline - Date.now()) / 1000);
      setSecondsLeft(Math.max(0, left));
      if (left <= 0) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [timeoutSecs]);

  if (decision) {
    const labels: Record<ApprovalDecision, string> = {
      approve: "Aprovado",
      deny: "Negado",
      always: "Sempre permitir",
    };
    return (
      <div className="rounded-lg border border-teal-700/50 bg-teal-950/40 px-3 py-2 text-sm text-teal-200">
        <span className="font-medium">{tool}</span>
        <span className="ml-2 text-teal-400">— {labels[decision]}</span>
      </div>
    );
  }

  return (
    <div className="my-1 rounded-lg border border-amber-600/50 bg-amber-950/30 px-3 py-2">
      <div className="text-sm font-medium text-amber-200">Aprovação necessária</div>
      <div className="mt-1 text-xs text-amber-300/80">
        {tool}
        {summary ? ` — ${summary}` : ""}
      </div>
      {secondsLeft > 0 && (
        <div className="mt-1 text-[11px] text-amber-400/70">expira em {secondsLeft}s</div>
      )}
      <div className="mt-2 flex gap-2">
        <button
          className="rounded bg-teal-600 px-3 py-1 text-xs font-medium text-white hover:bg-teal-500"
          onClick={() => onDecision("approve")}
        >
          Aprovar
        </button>
        <button
          className="rounded bg-slate-700 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-600"
          onClick={() => onDecision("deny")}
        >
          Negar
        </button>
        <button
          className="rounded border border-teal-600 px-3 py-1 text-xs font-medium text-teal-300 hover:bg-teal-950"
          onClick={() => onDecision("always")}
        >
          Sempre
        </button>
      </div>
    </div>
  );
}
