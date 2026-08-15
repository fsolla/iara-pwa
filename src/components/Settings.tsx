import { useState } from "react";

import { loadSettings, saveSettings, type Settings } from "../lib/settings";

interface SettingsProps {
  onSaved: () => void;
}

export function SettingsScreen({ onSaved }: SettingsProps) {
  const [s, setS] = useState<Settings>(() => loadSettings());
  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setS((prev) => ({ ...prev, [k]: e.target.value }));

  const save = () => {
    if (!s.gatewayUrl.trim() || !s.token.trim()) {
      alert("URL do gateway e token são obrigatórios.");
      return;
    }
    saveSettings(s);
    onSaved();
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="text-3xl font-bold text-teal-300">Iara</div>
        <div className="mt-1 text-sm text-slate-400">
          Converse com o seu assistente de IA. Apenas configure a URL do gateway e a chave.
        </div>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="text-xs font-medium text-slate-400">URL do gateway (WebSocket)</span>
          <input
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-teal-600"
            placeholder="wss://app.exemplo.dev/ws/chat"
            value={s.gatewayUrl}
            onChange={set("gatewayUrl")}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-400">Token / chave</span>
          <input
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-teal-600"
            type="password"
            placeholder="seu token de acesso"
            value={s.token}
            onChange={set("token")}
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-400">Agente</span>
            <input
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-teal-600"
              placeholder="main"
              value={s.agent}
              onChange={set("agent")}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-400">Nome da sessão</span>
            <input
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-teal-600"
              placeholder="Iara"
              value={s.sessionName}
              onChange={set("sessionName")}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-400">STT (voz → texto, opcional)</span>
            <input
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-teal-600"
              placeholder="https://…/transcribe"
              value={s.sttUrl}
              onChange={set("sttUrl")}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-400">TTS (texto → voz, opcional)</span>
            <input
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-teal-600"
              placeholder="https://…/tts"
              value={s.ttsUrl}
              onChange={set("ttsUrl")}
            />
          </label>
        </div>

        <button
          className="mt-2 w-full rounded bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-500"
          onClick={save}
        >
          Conectar
        </button>

        <p className="text-center text-xs text-slate-600">
          Os dados ficam apenas neste dispositivo (local-first). Projeto open source —{" "}
          <a className="underline" href="https://git.solla.dev/amana/iara-pwa" target="_blank" rel="noreferrer">
            amana/iara-pwa
          </a>
        </p>
      </div>
    </div>
  );
}
