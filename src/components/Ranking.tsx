import { useMemo, useState } from "react";
import { Game } from "../types";

interface RankingProps {
  games: Game[];
  onOpenGame: (id: string) => void;
}

type TopLimit = 3 | 5 | 10 | "all";

function formatPlaytime(totalSeconds: number): string {
  if (totalSeconds < 60) return "Moins d'une minute";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${minutes} min`;
}

function getRankBadge(index: number): string | null {
  if (index === 0) return "🏆";
  if (index === 1) return "🥈";
  if (index === 2) return "🥉";
  return null;
}

export default function Ranking({ games, onOpenGame }: RankingProps) {
  const [limit, setLimit] = useState<TopLimit>(10);

  const rankedGames = useMemo(() => {
    const sorted = [...games].sort((a, b) => b.total_playtime_seconds - a.total_playtime_seconds);
    if (limit === "all") return sorted;
    return sorted.slice(0, limit);
  }, [games, limit]);

  return (
    <div className="page-enter p-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <p className="nyro-section-title">Classement</p>
          <h1 className="text-xl font-semibold">Jeux les plus joués</h1>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-nexus-muted">Afficher</span>
          <div className="flex bg-nexus-panel2 border border-nexus-border rounded-lg p-0.5">
            {([
              { value: 3 as TopLimit, label: "Top 3" },
              { value: 5 as TopLimit, label: "Top 5" },
              { value: 10 as TopLimit, label: "Top 10" },
              { value: "all" as TopLimit, label: "Tout" },
            ]).map((option) => (
              <button
                key={option.label}
                onClick={() => setLimit(option.value)}
                className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                  limit === option.value
                    ? "bg-nexus-panel text-nexus-text border border-nexus-border"
                    : "text-nexus-muted hover:text-nexus-text"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {games.length === 0 ? (
        <div className="nyro-panel p-5 text-sm text-nexus-muted">Aucun jeu disponible pour le classement.</div>
      ) : (
        <div className="nyro-panel overflow-hidden">
          <div className="grid grid-cols-[80px_minmax(0,1fr)_180px_140px] text-xs text-nexus-muted border-b border-nexus-border bg-nexus-panel2/60">
            <div className="px-4 py-3">Rang</div>
            <div className="px-4 py-3">Jeu</div>
            <div className="px-4 py-3">Catégorie</div>
            <div className="px-4 py-3 text-right">Temps de jeu</div>
          </div>

          {rankedGames.map((game, index) => {
            const badge = getRankBadge(index);
            const rank = index + 1;

            return (
              <button
                key={game.id}
                onClick={() => onOpenGame(game.id)}
                className="w-full grid grid-cols-[80px_minmax(0,1fr)_180px_140px] items-center text-left border-b border-nexus-border last:border-b-0 hover:bg-nexus-panel2/45 transition-colors"
              >
                <div className="px-4 py-3 flex items-center gap-2 font-medium">
                  <span className="text-nexus-muted w-6">{rank}</span>
                  {badge ? <span className="text-base leading-none">{badge}</span> : <span className="w-4" />}
                </div>
                <div className="px-4 py-3 min-w-0 flex items-center gap-3">
                  <div
                    style={game.cover_image ? { backgroundImage: `url(${game.cover_image})`, backgroundSize: "cover", backgroundPosition: "center" } : { backgroundColor: "var(--nexus-panel2)" }}
                    className="w-10 h-14 rounded-md border border-nexus-border shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{game.name}</div>
                    <div className="text-xs text-nexus-muted truncate">
                      {game.last_played ? `Dernier lancement : ${new Date(game.last_played).toLocaleDateString("fr-FR")}` : "Jamais lancé récemment"}
                    </div>
                  </div>
                </div>
                <div className="px-4 py-3 text-sm text-nexus-muted truncate">{game.category || "Non catégorisé"}</div>
                <div className="px-4 py-3 text-sm text-right">{formatPlaytime(game.total_playtime_seconds)}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
