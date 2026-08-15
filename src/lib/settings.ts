export interface Settings {
  gatewayUrl: string;
  token: string;
  agent: string;
  sessionName: string;
  sttUrl: string;
  ttsUrl: string;
}

export const DEFAULT_SETTINGS: Settings = {
  gatewayUrl: "wss://app.solla.dev/ws/chat",
  token: "",
  agent: "main",
  sessionName: "Iara",
  sttUrl: "",
  ttsUrl: "",
};

const KEY = "iara.settings.v1";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

/** Deriva a URL de WebSocket a partir do gateway configurado.
 * Aceita ws://, wss://, http:// ou https:// — normaliza para ws/wss. */
export function wsUrl(s: Settings): string {
  const base = s.gatewayUrl.trim().replace(/\/+$/, "");
  const params = new URLSearchParams({
    agent: s.agent.trim() || DEFAULT_SETTINGS.agent,
  });
  const name = s.sessionName.trim();
  if (name) params.set("name", name);
  if (s.token.trim()) params.set("token", s.token.trim());
  return `${base}?${params.toString()}`;
}
