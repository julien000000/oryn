import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Game } from "../types";
import AddGameModal from "./AddGameModal";
import DetectGamesModal from "./DetectGamesModal";
import BulkCoverModal from "./BulkCoverModal";

interface GameLibraryProps {
  games: Game[];
  onOpenGame: (id: string) => void;
  onGameAdded: () => void;
}

type ViewMode = "grid-lg" | "grid-sm" | "list" | "list-compact";
type SortMode = "name" | "recent" | "playtime" | "category";

function PosterCard({ game, onOpen, small }: { game: Game; onOpen: () => void; small?: boolean }) {
  return (
    <button
      onClick={onOpen}
      style={
        game.cover_image
          ? {
              backgroundImage: `linear-gradient(to top, rgba(11,15,20,0.92) 0%, rgba(11,15,20,0.2) 56%, rgba(11,15,20,0.02) 100%), url(${game.cover_image})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : { backgroundColor: "var(--nexus-panel2)" }
      }
      className={`nyro-card-hover relative aspect-[2/3] rounded-lg border border-nexus-border overflow-hidden text-left flex flex-col justify-end ${
        small ? "p-1.5" : "p-3"
      }`}
    >
      {!game.cover_image && (
        <span
          className={`absolute inset-0 flex items-center justify-center font-semibold text-nexus-muted/30 ${
            small ? "text-2xl" : "text-5xl"
          }`}
        >
          {game.name.charAt(0).toUpperCase()}
        </span>
      )}
      {game.source === "steam" && !small && (
        <span className="absolute top-2 right-2 text-[10px] bg-nexus-bg/70 border border-nexus-border px-1.5 py-0.5 rounded z-10">
          Steam
        </span>
      )}
      <p className={`font-semibold truncate relative z-10 ${small ? "text-xs" : "text-sm"}`}>{game.name}</p>
      {!small && <p className="text-xs text-nexus-muted truncate relative z-10">{game.category || "Non catégorisé"}</p>}
    </button>
  );
}

function ListRow({ game, onOpen, compact }: { game: Game; onOpen: () => void; compact?: boolean }) {
  async function quickLaunch(e: React.MouseEvent) {
    e.stopPropagation();
    await invoke("launch_game", { id: game.id });
  }

  return (
    <button
      onClick={onOpen}
      className={`nyro-panel nyro-card-hover w-full flex items-center gap-3 text-left ${
        compact ? "px-2 py-1" : "px-3 py-2"
      }`}
    >
      <div
        style={
          game.cover_image
            ? { backgroundImage: `url(${game.cover_image})`, backgroundSize: "cover", backgroundPosition: "center" }
            : { backgroundColor: "var(--nexus-panel2)" }
        }
        className={`rounded-md shrink-0 border border-nexus-border ${compact ? "w-6 h-9" : "w-10 h-14"}`}
      />
      <div className="flex-1 min-w-0">
        <p className={`font-medium truncate ${compact ? "text-xs" : "text-sm"}`}>{game.name}</p>
        {!compact && <p className="text-xs text-nexus-muted truncate">{game.category || "Non catégorisé"}</p>}
      </div>
      {game.source === "steam" && (
        <span className="text-[10px] bg-nexus-panel2 border border-nexus-border px-1.5 py-0.5 rounded shrink-0">
          Steam
        </span>
      )}
      <button
        onClick={quickLaunch}
        className={`nyro-btn-strong shrink-0 font-medium ${
          compact ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs"
        }`}
      >
        ▶ Jouer
      </button>
    </button>
  );
}

export default function GameLibrary({ games, onOpenGame, onGameAdded }: GameLibraryProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetectModal, setShowDetectModal] = useState(false);
  const [showBulkCoverModal, setShowBulkCoverModal] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid-lg");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [search, setSearch] = useState("");

  const visibleGames = useMemo(() => {
    let list = games;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (g) => g.name.toLowerCase().includes(q) || g.category.toLowerCase().includes(q) || g.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    const sorted = [...list];
    switch (sortMode) {
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "recent":
        sorted.sort((a, b) => (b.last_played ?? "").localeCompare(a.last_played ?? ""));
        break;
      case "playtime":
        sorted.sort((a, b) => b.total_playtime_seconds - a.total_playtime_seconds);
        break;
      case "category":
        sorted.sort((a, b) => a.category.localeCompare(b.category));
        break;
    }
    return sorted;
  }, [games, search, sortMode]);

  const gamesNeedingMedia = games.filter((g) => !g.cover_image || !g.logo_image).length;

  return (
    <div className="page-enter p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <p className="nyro-section-title">Bibliothèque</p>
          <h1 className="text-xl font-semibold">Jeux</h1>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {gamesNeedingMedia > 0 && (
            <button
              onClick={() => setShowBulkCoverModal(true)}
              className="nyro-btn px-3 py-2 text-xs font-medium"
            >
              Tout appliquer ({gamesNeedingMedia})
            </button>
          )}
          <button
            data-tutorial-id="tutorial-detect-games"
            onClick={() => setShowDetectModal(true)}
            className="nyro-btn px-4 py-2 text-sm font-medium"
          >
            Détection auto
          </button>
          <button
            data-tutorial-id="tutorial-add-game"
            onClick={() => setShowAddModal(true)}
            className="nyro-btn-strong px-4 py-2 text-sm font-medium"
          >
            Ajouter un jeu
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrer la bibliothèque"
          className="nyro-input flex-1 min-w-[180px] px-3 py-2 text-sm"
        />
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="nyro-input px-3 py-2 text-xs"
        >
          <option value="name">Trier : Nom</option>
          <option value="recent">Trier : Dernier joué</option>
          <option value="playtime">Trier : Temps de jeu</option>
          <option value="category">Trier : Catégorie</option>
        </select>
        <div className="flex bg-nexus-panel2 border border-nexus-border rounded-lg p-0.5">
          {(
            [
              { id: "grid-lg", label: "▦ Grande grille" },
              { id: "grid-sm", label: "▦ Petite grille" },
              { id: "list", label: "☰ Liste" },
              { id: "list-compact", label: "☰ Compacte" },
            ] as { id: ViewMode; label: string }[]
          ).map((v) => (
            <button
              key={v.id}
              onClick={() => setViewMode(v.id)}
              className={`px-2.5 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors ${
                viewMode === v.id ? "bg-nexus-panel text-nexus-text border border-nexus-border" : "text-nexus-muted hover:text-nexus-text"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {visibleGames.length === 0 ? (
        <p className="text-sm text-nexus-muted">
          {games.length === 0 ? "Aucun jeu pour l'instant. Clique sur « Ajouter un jeu » pour commencer." : "Aucun jeu ne correspond à ta recherche."}
        </p>
      ) : viewMode === "grid-lg" ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-4">
          {visibleGames.map((g) => (
            <PosterCard key={g.id} game={g} onOpen={() => onOpenGame(g.id)} />
          ))}
        </div>
      ) : viewMode === "grid-sm" ? (
        <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-9 lg:grid-cols-11 gap-2">
          {visibleGames.map((g) => (
            <PosterCard key={g.id} game={g} onOpen={() => onOpenGame(g.id)} small />
          ))}
        </div>
      ) : viewMode === "list" ? (
        <div className="space-y-2 max-w-2xl">
          {visibleGames.map((g) => (
            <ListRow key={g.id} game={g} onOpen={() => onOpenGame(g.id)} />
          ))}
        </div>
      ) : (
        <div className="space-y-1 max-w-2xl">
          {visibleGames.map((g) => (
            <ListRow key={g.id} game={g} onOpen={() => onOpenGame(g.id)} compact />
          ))}
        </div>
      )}

      {showAddModal && (
        <AddGameModal
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            setShowAddModal(false);
            onGameAdded();
          }}
        />
      )}

      {showDetectModal && (
        <DetectGamesModal
          onClose={() => setShowDetectModal(false)}
          onAdded={() => {
            setShowDetectModal(false);
            onGameAdded();
          }}
        />
      )}

      {showBulkCoverModal && (
        <BulkCoverModal onClose={() => setShowBulkCoverModal(false)} onFinished={onGameAdded} />
      )}
    </div>
  );
}
