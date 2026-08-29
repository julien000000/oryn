import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DetectedGame } from "../types";

interface DetectGamesModalProps {
  onClose: () => void;
  onAdded: () => void;
}

export default function DetectGamesModal({ onClose, onAdded }: DetectGamesModalProps) {
  const [status, setStatus] = useState<"idle" | "scanning" | "done">("idle");
  const [found, setFound] = useState<DetectedGame[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function handleScan() {
    setStatus("scanning");
    setError(null);
    try {
      const results = await invoke<DetectedGame[]>("detect_games");
      setFound(results);
      setSelected(new Set(results.map((_, i) => i)));
      setStatus("done");
    } catch (e) {
      setError(String(e));
      setStatus("idle");
    }
  }

  function toggle(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function handleConfirm() {
    setAdding(true);
    setError(null);
    try {
      const toAdd = found.filter((_, i) => selected.has(i));
      await invoke("confirm_detected_games", { games: toAdd });
      onAdded();
    } catch (e) {
      setError(String(e));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-nexus-panel border border-nexus-border rounded-xl2 p-6 w-full max-w-lg max-h-[80vh] flex flex-col">
        <h2 className="text-lg font-semibold mb-1">Détection automatique</h2>
        <p className="text-xs text-nexus-muted mb-4">
          Recherche tes jeux Steam installés et scanne un dossier "Games" à la racine de chaque disque.
        </p>

        {status === "idle" && (
          <button
            onClick={handleScan}
            className="bg-nexus-accent hover:opacity-90 transition-opacity px-4 py-2 rounded-xl2 text-sm font-medium self-start"
          >
            🔍 Lancer la recherche
          </button>
        )}

        {status === "scanning" && (
          <p className="text-sm text-nexus-muted">Recherche en cours...</p>
        )}

        {error && <p className="text-xs text-nexus-danger mt-2">{error}</p>}

        {status === "done" && (
          <>
            <p className="text-sm mb-3">
              {found.length === 0
                ? "Aucun nouveau jeu trouvé."
                : `${found.length} jeu${found.length > 1 ? "x" : ""} trouvé${found.length > 1 ? "s" : ""}.`}
            </p>
            <div className="flex-1 overflow-y-auto space-y-1 mb-4">
              {found.map((g, i) => (
                <label
                  key={`${g.source}-${g.executable_path}-${i}`}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-nexus-panel2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => toggle(i)}
                    className="accent-nexus-accent"
                  />
                  <span className="text-xs">{g.source === "steam" ? "🎮" : "📁"}</span>
                  <span className="flex-1 min-w-0">
                    <p className="text-sm truncate">{g.name}</p>
                    <p className="text-xs text-nexus-muted truncate">
                      {g.source === "steam" ? "Steam" : g.executable_path}
                    </p>
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-nexus-border mt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-nexus-muted hover:text-nexus-text">
            {status === "done" ? "Annuler" : "Fermer"}
          </button>
          {status === "done" && found.length > 0 && (
            <button
              onClick={handleConfirm}
              disabled={adding || selected.size === 0}
              className="bg-nexus-accent hover:opacity-90 transition-opacity px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {adding ? "Ajout..." : `Ajouter (${selected.size})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
