import { Game } from "../types";
import SidebarIcon from "./SidebarIcon";
import lapinTuto from "../../assets/lapin_tuto.png";

interface DashboardProps {
  games: Game[];
  onOpenGame: (id: string) => void;
  onLaunchGame: (id: string) => void;
  onGoToLibrary: () => void;
  onOpenTutorial: () => void;
}

export default function Dashboard({ games, onOpenGame, onLaunchGame, onGoToLibrary, onOpenTutorial }: DashboardProps) {
  const recent = [...games]
    .filter((g) => g.last_played)
    .sort((a, b) => (b.last_played! > a.last_played! ? 1 : -1));

  const lastPlayed = recent[0];

  return (
      <div className="page-enter p-8 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="nyro-section-title">Accueil</p>
            <h1 className="text-2xl font-semibold">Bonjour.</h1>
            <p className="text-nexus-muted text-sm">Voici ton environnement gaming, en un coup d'œil.</p>
          </div>
          <button
            data-tutorial-id="tutorial-open-rabbit"
            onClick={onOpenTutorial}
            className="tutorial-rabbit-btn"
            title="Ouvrir le tutoriel"
          >
            <SidebarIcon src={lapinTuto} alt="Tutoriel" removeGreenScreen className="w-11 h-11 object-contain" />
          </button>
        </div>

      {lastPlayed ? (
        <section className="nyro-panel p-6 flex items-center justify-between gap-4">
          <div>
            <p className="nyro-section-title mb-2">Continuer</p>
            <h2 className="text-lg font-medium">{lastPlayed.name}</h2>
            <p className="text-xs text-nexus-muted mt-1">
              Dernière session : {new Date(lastPlayed.last_played!).toLocaleString("fr-FR")}
            </p>
          </div>
          <button
            onClick={() => onLaunchGame(lastPlayed.id)}
            className="nyro-btn-strong px-5 py-2 text-sm font-medium"
          >
            ▶ JOUER
          </button>
        </section>
      ) : (
        <section className="nyro-panel p-5 text-nexus-muted text-sm">
          Aucun jeu lancé pour l'instant.{" "}
          <button onClick={onGoToLibrary} className="text-nexus-accent hover:text-nexus-text transition-colors">
            Ajoute ton premier jeu
          </button>
          .
        </section>
      )}

      <section data-tutorial-id="tutorial-recent-games">
        <p className="nyro-section-title mb-3">Récemment ajoutés</p>
        {games.length === 0 ? (
          <p className="text-sm text-nexus-muted">Ta bibliothèque est vide.</p>
        ) : (
          <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
            {games.slice(0, 8).map((g) => (
              <button
                key={g.id}
                onClick={() => onOpenGame(g.id)}
                style={
                  g.cover_image
                    ? {
                        backgroundImage: `linear-gradient(to top, rgba(11,15,20,0.92) 0%, rgba(11,15,20,0.22) 58%, rgba(11,15,20,0.02) 100%), url(${g.cover_image})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : { backgroundColor: "var(--nexus-panel2)" }
                }
                className="nyro-card-hover relative aspect-[2/3] rounded-lg border border-nexus-border overflow-hidden text-left flex flex-col justify-end p-3"
              >
                {!g.cover_image && (
                  <span className="absolute inset-0 flex items-center justify-center text-3xl font-semibold text-nexus-muted/30">
                    {g.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <p className="text-xs font-medium truncate relative z-10">{g.name}</p>
                <p className="text-[10px] text-nexus-muted truncate relative z-10">{g.category || "—"}</p>
              </button>
            ))}
          </div>
        )}
      </section>
      </div>
  );
}
