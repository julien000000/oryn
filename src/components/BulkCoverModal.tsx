import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { notify } from "../notify";

interface BulkCoverModalProps {
  onClose: () => void;
  onFinished: () => void;
}

interface Progress {
  done: number;
  total: number;
  gameName: string;
  found: boolean | null;
}

export default function BulkCoverModal({ onClose, onFinished }: BulkCoverModalProps) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [foundCount, setFoundCount] = useState(0);
  const [notFoundCount, setNotFoundCount] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const unlisten = listen<Progress>("bulk-cover-progress", (e) => {
      setProgress(e.payload);
      if (e.payload.found === true) setFoundCount((c) => c + 1);
      if (e.payload.found === false) setNotFoundCount((c) => c + 1);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  async function start() {
    setRunning(true);
    setError(null);
    setFoundCount(0);
    setNotFoundCount(0);
    try {
      await invoke("bulk_apply_covers");
      setDone(true);
      onFinished();
    } catch (e) {
      setError(String(e));
      notify(`Erreur : ${e}`, "error");
    } finally {
      setRunning(false);
    }
  }

  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-nexus-panel border border-nexus-border rounded-xl2 p-6 w-full max-w-md space-y-4">
        <h2 className="text-lg font-semibold">Tout appliquer</h2>
        <p className="text-xs text-nexus-muted">
          Récupère automatiquement, pour chaque jeu qui n'en a pas déjà, la cover et le logo flottant
          depuis SteamGridDB. Ne remplace jamais une cover ou un logo déjà défini (custom ou récupéré
          avant) — seuls les éléments manquants sont complétés.
        </p>

        {error && <p className="text-xs text-nexus-danger">{error}</p>}

        {!running && !done && (
          <button
            onClick={start}
            className="bg-nexus-accent hover:opacity-90 transition-opacity px-4 py-2 rounded-xl2 text-sm font-medium"
          >
            Lancer
          </button>
        )}

        {(running || done) && progress && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-nexus-muted">
              <span className="truncate max-w-[70%]">{progress.gameName}</span>
              <span>
                {progress.done} / {progress.total} ({percent}%)
              </span>
            </div>
            <div className="w-full h-2 bg-nexus-panel2 rounded-full overflow-hidden">
              <div
                className="h-full bg-nexus-accent rounded-full transition-all duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="flex gap-4 text-xs text-nexus-muted">
              <span className="text-nexus-success">✓ {foundCount} complété{foundCount > 1 ? "s" : ""}</span>
              <span>✕ {notFoundCount} sans résultat</span>
            </div>
          </div>
        )}

        {done && <p className="text-sm text-nexus-success">Terminé.</p>}

        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-nexus-muted hover:text-nexus-text">
            {done ? "Fermer" : "Annuler"}
          </button>
        </div>
      </div>
    </div>
  );
}
