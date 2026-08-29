import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Game, OnlineCoverOption, OnlineGameMatch } from "../types";
import { notify } from "../notify";

interface OnlineMediaSearchProps {
  game: Game;
  onClose: () => void;
  onApplied: () => void;
}

type Step = "search" | "pick-match" | "pick-media";

export default function OnlineMediaSearch({ game, onClose, onApplied }: OnlineMediaSearchProps) {
  const [step, setStep] = useState<Step>("search");
  const [query, setQuery] = useState(game.name);
  const [matches, setMatches] = useState<OnlineGameMatch[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<OnlineGameMatch | null>(null);
  const [covers, setCovers] = useState<OnlineCoverOption[]>([]);
  const [logos, setLogos] = useState<OnlineCoverOption[]>([]);
  const [selectedCover, setSelectedCover] = useState<OnlineCoverOption | null>(null);
  const [selectedLogo, setSelectedLogo] = useState<OnlineCoverOption | null>(null);
  const [renameToo, setRenameToo] = useState(true);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const results = await invoke<OnlineGameMatch[]>("search_online_game", { query: query.trim() });
      setMatches(results);
      setStep("pick-match");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handlePickMatch(m: OnlineGameMatch) {
    setSelectedMatch(m);
    setLoading(true);
    setError(null);
    setSelectedCover(null);
    setSelectedLogo(null);
    try {
      const [coverResults, logoResults] = await Promise.all([
        invoke<OnlineCoverOption[]>("fetch_online_covers", { sgdbId: m.id }),
        invoke<OnlineCoverOption[]>("fetch_online_logos", { sgdbId: m.id }).catch(() => []),
      ]);
      setCovers(coverResults);
      setLogos(logoResults);
      setStep("pick-media");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!selectedCover) {
      setError("Choisis au moins une cover.");
      return;
    }
    setApplying(true);
    setError(null);
    try {
      await invoke("apply_online_cover", {
        id: game.id,
        imageUrl: selectedCover.url,
        correctedName: renameToo && selectedMatch ? selectedMatch.name : null,
      });
      if (selectedLogo) {
        await invoke("apply_online_logo", { id: game.id, imageUrl: selectedLogo.url });
      }
      notify(selectedLogo ? "Cover + logo appliqués" : "Cover appliquée", "success");
      onApplied();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-nexus-panel border border-nexus-border rounded-xl2 p-6 w-full max-w-2xl max-h-[85vh] flex flex-col">
        <h2 className="text-lg font-semibold mb-1">Cover + logo + nom en ligne</h2>
        <p className="text-xs text-nexus-muted mb-4">Source : SteamGridDB</p>

        {error && <p className="text-xs text-nexus-danger mb-3">{error}</p>}

        {step === "search" && (
          <div className="space-y-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Nom du jeu à rechercher"
              className="w-full bg-nexus-panel2 border border-nexus-border rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="bg-nexus-accent hover:opacity-90 transition-opacity px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {loading ? "Recherche..." : "Rechercher"}
            </button>
          </div>
        )}

        {step === "pick-match" && (
          <div className="flex-1 overflow-y-auto space-y-1">
            <p className="text-xs text-nexus-muted mb-2">
              Choisis la bonne correspondance ({matches.length} résultat{matches.length > 1 ? "s" : ""}) :
            </p>
            {matches.length === 0 && (
              <p className="text-sm text-nexus-muted">Aucun résultat. Réessaie avec un autre nom.</p>
            )}
            {matches.map((m) => (
              <button
                key={m.id}
                onClick={() => handlePickMatch(m)}
                disabled={loading}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-nexus-panel2 flex items-center gap-2 text-sm disabled:opacity-50"
              >
                <span className="flex-1">{m.name}</span>
                {m.verified && <span className="text-[10px] text-nexus-success">vérifié</span>}
              </button>
            ))}
            {loading && <p className="text-xs text-nexus-muted">Chargement des covers et logos...</p>}
            <button onClick={() => setStep("search")} className="text-xs text-nexus-muted hover:text-nexus-text mt-2">
              ← Modifier la recherche
            </button>
          </div>
        )}

        {step === "pick-media" && (
          <div className="flex-1 overflow-y-auto flex flex-col gap-4">
            <div>
              <p className="text-xs text-nexus-muted mb-2">
                Cover (obligatoire) — {covers.length} disponible{covers.length > 1 ? "s" : ""}
              </p>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                {covers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCover(c)}
                    className={`aspect-[2/3] rounded-lg overflow-hidden border-2 transition-colors ${
                      selectedCover?.id === c.id ? "border-nexus-accent" : "border-transparent hover:border-nexus-border"
                    }`}
                  >
                    <img src={c.thumb} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
              {covers.length === 0 && <p className="text-sm text-nexus-muted">Aucune cover trouvée.</p>}
            </div>

            <div>
              <p className="text-xs text-nexus-muted mb-2">
                Logo flottant (optionnel) — {logos.length} disponible{logos.length > 1 ? "s" : ""}
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {logos.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setSelectedLogo(selectedLogo?.id === l.id ? null : l)}
                    className={`aspect-video rounded-lg overflow-hidden border-2 bg-nexus-panel2 flex items-center justify-center p-2 transition-colors ${
                      selectedLogo?.id === l.id ? "border-nexus-accent" : "border-transparent hover:border-nexus-border"
                    }`}
                  >
                    <img src={l.thumb} alt="" className="max-w-full max-h-full object-contain" />
                  </button>
                ))}
              </div>
              {logos.length === 0 && (
                <p className="text-sm text-nexus-muted">Aucun logo trouvé — le nom du jeu sera affiché stylisé à la place.</p>
              )}
            </div>

            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={renameToo}
                onChange={(e) => setRenameToo(e.target.checked)}
                className="accent-nexus-accent"
              />
              Renommer aussi le jeu en "{selectedMatch?.name}"
            </label>

            <div className="flex gap-2">
              <button onClick={() => setStep("pick-match")} className="text-xs text-nexus-muted hover:text-nexus-text">
                ← Changer de jeu
              </button>
              <div className="flex-1" />
              <button
                onClick={handleApply}
                disabled={applying || !selectedCover}
                className="bg-nexus-accent hover:opacity-90 transition-opacity px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {applying ? "Application..." : "Appliquer"}
              </button>
            </div>
          </div>
        )}

        <button onClick={onClose} className="text-xs text-nexus-muted hover:text-nexus-text mt-4 self-start">
          Fermer
        </button>
      </div>
    </div>
  );
}
