import { useState } from "react";

import { Chat } from "./components/Chat";
import { SettingsScreen } from "./components/Settings";
import { loadSettings } from "./lib/settings";

export default function App() {
  const [configured, setConfigured] = useState<boolean>(() => {
    const s = loadSettings();
    return Boolean(s.gatewayUrl.trim() && s.token.trim());
  });
  const [showSettings, setShowSettings] = useState(false);

  if (showSettings) {
    return <SettingsScreen onSaved={() => setShowSettings(false)} />;
  }

  if (!configured) {
    return <SettingsScreen onSaved={() => setConfigured(true)} />;
  }

  return <Chat onEditSettings={() => setShowSettings(true)} />;
}
