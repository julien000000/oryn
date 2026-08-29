import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Game, SteamAchievement } from "../types";

interface SteamAchievementsProps {
  game: Game;
}

export default function SteamAchievements({ game }: SteamAchievementsProps) {
  const [achievements, setAchievements] = useState<SteamAchievement[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (game.source !== "steam") return null;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<SteamAchievement[]>("fetch_steam_achievements", { gameId: game.id });
      setAchievements(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const unlockedCount = achievements?.filter((a) => a.achieved).length ?? 0;

  return (
    <div className="bg-nexus-panel border border-nexus-border rounded-xl2 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-nexus-muted">
          SUCCÈS STEAM {achievements && `(${unlockedCount}/${achievements.length})`}
        </p>
        <button onClick={load} disabled={loading} className="text-xs text-nexus-accent2 hover:underline disabled:opacity-50">
          {loading ? "Chargement..." : achievements ? "Actualiser" : "Charger"}
        </button>
      </div>

      {error && <p className="text-xs text-nexus-danger">{error}</p>}

      {achievements && achievements.length === 0 && !error && (
        <p className="text-sm text-nexus-muted">Ce jeu n'a pas de succès Steam.</p>
      )}

      {achievements && achievements.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
          {achievements.map((a) => (
            <div
              key={a.api_name}
              className={`flex items-center gap-2 p-2 rounded-lg ${a.achieved ? "" : "opacity-40"}`}
              title={a.description}
            >
              {a.icon && <img src={a.icon} alt="" className="w-8 h-8 rounded" />}
              <span className="text-xs truncate">{a.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
