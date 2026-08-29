import { useMemo, useState } from "react";
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

function GameTile({
  game,
  selected,
  onClick,
}: {
  game: Game;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`xbox-game-tile ${selected ? "is-selected" : ""}`}
      style={
        game.cover_image
          ? { backgroundImage: `url(${game.cover_image})` }
          : undefined
      }
      title={game.name}
    >
      {!game.cover_image && <span className="xbox-game-letter">{game.name.charAt(0).toUpperCase()}</span>}
      <span className="xbox-game-shade" />
      <span className="xbox-game-name">{game.name}</span>
    </button>
  );
}

export default function Dashboard({
  games,
  onOpenGame,
  onLaunchGame,
  onGoToLibrary,
  onOpenTutorial,
}: DashboardProps) {
  const recent = useMemo(
    () =>
      [...games]
        .filter((g) => g.last_played)
        .sort((a, b) => (b.last_played! > a.last_played! ? 1 : -1)),
    [games],
  );

  const featured = recent[0] ?? games[0];
  const [focusedId, setFocusedId] = useState(featured?.id ?? null);
  const focusedGame = games.find((g) => g.id === focusedId) ?? featured;
  const rowGames = games.slice(0, 10);
  const lastPlayed = recent.slice(0, 8);

  return (
    <div className="xbox-home page-enter">
      <div
        className="xbox-backdrop"
        style={
          focusedGame?.cover_image
            ? { backgroundImage: `url(${focusedGame.cover_image})` }
            : undefined
        }
      />
      <div className="xbox-backdrop-overlay" />

      <header className="xbox-topbar">
        <div className="xbox-profile">
          <div className="xbox-avatar">{featured ? featured.name.charAt(0).toUpperCase() : "N"}</div>
          <div>
            <div className="xbox-gamertag">Nyro Player</div>
            <div className="xbox-status"><span /> EN LIGNE</div>
          </div>
        </div>

        <nav className="xbox-quick-nav" aria-label="Navigation rapide">
          <button onClick={onGoToLibrary} title="Ma bibliothèque">▦</button>
          <button onClick={onGoToLibrary} title="Jeux">⌁</button>
          <button onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", ctrlKey: true }))} title="Recherche">⌕</button>
          <button onClick={onOpenTutorial} title="Aide">?</button>
        </nav>

        <div className="xbox-clock">
          <span>NYRO</span>
          <strong>{new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date())}</strong>
        </div>
      </header>

      <div className="xbox-content">
        {focusedGame ? (
          <section className="xbox-featured">
            <div className="xbox-featured-copy">
              <p className="xbox-kicker">CONTINUER À JOUER</p>
              <h1>{focusedGame.name}</h1>
              <p className="xbox-featured-meta">
                {focusedGame.category || "Bibliothèque Nyro"}
                {focusedGame.last_played
                  ? ` · Dernière session le ${new Date(focusedGame.last_played).toLocaleDateString("fr-FR")}`
                  : ""}
              </p>
              <div className="xbox-featured-actions">
                <button className="xbox-play" onClick={() => onLaunchGame(focusedGame.id)}>
                  <span>▶</span> JOUER
                </button>
                <button className="xbox-secondary" onClick={() => onOpenGame(focusedGame.id)}>
                  VOIR LE JEU
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="xbox-empty-featured">
            <p className="xbox-kicker">BIENVENUE SUR NYRO</p>
            <h1>Ta bibliothèque, ton espace.</h1>
            <p>Ajoute tes jeux pour créer un accueil vivant et personnalisé.</p>
            <button className="xbox-play" onClick={onGoToLibrary}>AJOUTER DES JEUX</button>
          </section>
        )}

        <section className="xbox-section">
          <div className="xbox-section-heading">
            <div>
              <p className="xbox-kicker">ACCÈS RAPIDE</p>
              <h2>Mes jeux</h2>
            </div>
            <button onClick={onGoToLibrary}>TOUT AFFICHER →</button>
          </div>

          {rowGames.length > 0 ? (
            <div className="xbox-game-row">
              {rowGames.map((game) => (
                <GameTile
                  key={game.id}
                  game={game}
                  selected={focusedGame?.id === game.id}
                  onClick={() => {
                    setFocusedId(game.id);
                    onOpenGame(game.id);
                  }}
                />
              ))}
              <button className="xbox-all-games" onClick={onGoToLibrary}>
                <span>+</span>
                <small>BIBLIOTHÈQUE</small>
              </button>
            </div>
          ) : (
            <div className="xbox-empty-row">Ta bibliothèque est encore vide.</div>
          )}
        </section>

        <section className="xbox-section">
          <div className="xbox-section-heading">
            <div>
              <p className="xbox-kicker">TON ESPACE</p>
              <h2>À la une</h2>
            </div>
          </div>

          <div className="xbox-feature-grid">
            <button className="xbox-feature-card xbox-feature-library" onClick={onGoToLibrary}>
              <div>
                <span className="xbox-card-icon">▦</span>
                <p>PARCOURIR</p>
                <strong>Ta bibliothèque</strong>
              </div>
            </button>
            <button className="xbox-feature-card xbox-feature-recent" onClick={() => focusedGame && onOpenGame(focusedGame.id)}>
              <div>
                <span className="xbox-card-icon">◷</span>
                <p>REPRENDRE</p>
                <strong>{lastPlayed[0]?.name ?? "Ton prochain jeu"}</strong>
              </div>
            </button>
            <button className="xbox-feature-card xbox-feature-tutorial" onClick={onOpenTutorial}>
              <div className="xbox-tutorial-card-content">
                <SidebarIcon src={lapinTuto} alt="" removeGreenScreen className="w-14 h-14 object-contain" />
                <div>
                  <p>BIENVENUE</p>
                  <strong>Personnalise Nyro</strong>
                </div>
              </div>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
