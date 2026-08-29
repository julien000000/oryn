import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppConfig, Game } from "./types";

export default function MiniMode() {
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    invoke<AppConfig>("get_config").then(setConfig);
  }, []);

  if (!config) {
    return <div className="h-screen bg-nexus-bg flex items-center justify-center text-xs text-nexus-muted">...</div>;
  }

  const recent: Game[] = [...config.games]
    .filter((g) => g.last_played)
    .sort((a, b) => (b.last_played! > a.last_played! ? 1 : -1));
  const lastPlayed = recent[0] ?? config.games[0] ?? null;

  async function launch(id: string) {
    await invoke("launch_game", { id });
  }

  async function openFull() {
    await invoke("focus_main_window");
  }

  return (
    <div className="h-screen bg-nexus-bg text-nexus-text p-3 flex flex-col justify-between select-none">
      {lastPlayed ? (
        <div>
          <p className="text-[10px] text-nexus-muted">DERNIER JEU</p>
          <p className="text-sm font-medium truncate">{lastPlayed.name}</p>
        </div>
      ) : (
        <p className="text-xs text-nexus-muted">Aucun jeu dans Nyro.</p>
      )}

      <div className="flex gap-2">
        {lastPlayed && (
          <button
            onClick={() => launch(lastPlayed.id)}
            className="flex-1 bg-nexus-accent hover:opacity-90 transition-opacity px-3 py-2 rounded-lg text-xs font-medium"
          >
            ▶ Jouer
          </button>
        )}
        <button
          onClick={openFull}
          className="bg-nexus-panel2 border border-nexus-border px-3 py-2 rounded-lg text-xs hover:border-nexus-accent"
        >
          ⛶ Nyro
        </button>
      </div>
    </div>
  );
}
