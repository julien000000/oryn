import { useMemo, useState } from "react";
import { Game } from "../types";

interface DashboardProps {
  games: Game[];
  onOpenGame: (id: string) => void;
  onLaunchGame: (id: string) => void;
  onGoToLibrary: () => void;
  onOpenTutorial: () => void;
  profile: { name: string; avatar: string | null };
}

function GameTile({ game, selected, onClick }: { game: Game; selected?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`xbox-game-tile ${selected ? "is-selected" : ""}`} style={game.cover_image ? { backgroundImage: `url(${game.cover_image})` } : undefined} title={game.name}>
      {!game.cover_image && <span className="xbox-game-letter">{game.name.charAt(0).toUpperCase()}</span>}
      <span className="xbox-game-shade" />
      <span className="xbox-game-name">{game.name}</span>
    </button>
  );
}

export default function Dashboard({ games, onOpenGame, onLaunchGame, onGoToLibrary, onOpenTutorial, profile }: DashboardProps) {
  const recent = useMemo(() => [...games].filter((g) => g.last_played).sort((a, b) => (b.last_played! > a.last_played! ? 1 : -1)), [games]);
  const featured = recent[0] ?? games[0];
  const [focusedId, setFocusedId] = useState(featured?.id ?? null);
  const focusedGame = games.find((g) => g.id === focusedId) ?? featured;
  const rowGames = games.slice(0, 10);
  const avatarIsImage = profile.avatar?.startsWith("data:image/");

  function openSearch() {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", ctrlKey: true }));
  }

  return (
    <div className="xbox-home page-enter" style={{ backgroundColor: "#030609" }}>
      <div className="xbox-backdrop" style={focusedGame?.cover_image ? { backgroundImage: `url(${focusedGame.cover_image})`, backgroundColor: "#030609", filter: "brightness(.22) contrast(1.35) saturate(1.08)" } : { backgroundColor: "#030609" }} />
      <div className="xbox-backdrop-overlay" style={{ backgroundColor: "rgba(1,3,7,.86)" }} />

      <header className="xbox-topbar">
        <div className="xbox-profile">
          <div className="xbox-avatar">{avatarIsImage ? <img src={profile.avatar!} alt="" /> : <span>{profile.avatar || profile.name.charAt(0).toUpperCase()}</span>}</div>
          <div><div className="xbox-gamertag">{profile.name}</div><div className="xbox-status"><span /> EN LIGNE</div></div>
        </div>
        <button className="nyro-home-search" onClick={openSearch} aria-label="Rechercher un jeu">
          <span className="nyro-search-icon">⌕</span>
          <span>Rechercher un jeu...</span>
          <kbd>Ctrl + Espace</kbd>
        </button>
        <div className="xbox-clock"><span>NYRO</span><strong>{new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date())}</strong></div>
      </header>

      <div className="xbox-content">
        <div className="xbox-welcome"><span>ACCUEIL</span><strong>Bonjour, {profile.name}.</strong></div>
        {focusedGame ? (
          <section className="xbox-featured">
            <div className="xbox-featured-copy">
              <p className="xbox-kicker">À LA UNE · CONTINUER</p>
              <h1>{focusedGame.name}</h1>
              <p className="xbox-featured-meta">{focusedGame.category || "Jeu installé"}{focusedGame.last_played ? ` · Dernière session ${new Date(focusedGame.last_played).toLocaleDateString("fr-FR")}` : ""}</p>
              <div className="xbox-featured-actions"><button className="xbox-play" onClick={() => onLaunchGame(focusedGame.id)}><span>▶</span> JOUER</button><button className="xbox-secondary" onClick={() => onOpenGame(focusedGame.id)}>•••</button></div>
            </div>
          </section>
        ) : (
          <section className="xbox-empty-featured"><div><p className="xbox-kicker">BIENVENUE SUR NYRO</p><h1>Ton espace gaming.</h1><p>Ajoute tes jeux pour construire ton accueil.</p><button className="xbox-play" onClick={onGoToLibrary}>AJOUTER DES JEUX</button></div></section>
        )}

        <section className="xbox-section"><div className="xbox-section-heading"><div><p className="xbox-kicker">RÉCEMMENT JOUÉS</p><h2>Ta collection</h2></div><button onClick={onGoToLibrary}>VOIR TOUT →</button></div>
          {rowGames.length > 0 ? <div className="xbox-game-row">{rowGames.map((game) => <GameTile key={game.id} game={game} selected={focusedGame?.id === game.id} onClick={() => { setFocusedId(game.id); onOpenGame(game.id); }} />)}<button className="xbox-all-games" onClick={onGoToLibrary}><span>+</span><small>BIBLIOTHÈQUE</small></button></div> : <div className="xbox-empty-row">Ta bibliothèque est encore vide.</div>}
        </section>
      </div>
    </div>
  );
}
