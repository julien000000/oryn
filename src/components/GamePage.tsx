import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Game, GameMedia } from "../types";
import GameProfiles from "./GameProfiles";
import ModsManager from "./ModsManager";
import OnlineMediaSearch from "./OnlineMediaSearch";
import SteamAchievements from "./SteamAchievements";
import LaunchScreen from "./LaunchScreen";
import { notify } from "../notify";

function formatPlaytime(totalSeconds: number): string {
  if (totalSeconds < 60) return "Moins d'une minute";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${minutes} min`;
}

interface GamePageProps {
  game: Game;
  onBack: () => void;
  onLaunched: () => void;
  onRemoved: () => void;
  developerMode: boolean;
}

export default function GamePage({ game, onBack, onLaunched, onRemoved, developerMode }: GamePageProps) {
  const [error, setError] = useState<string | null>(null);
  const [showOnlineSearch, setShowOnlineSearch] = useState(false);
  const [media, setMedia] = useState<GameMedia | null>(null);
  const [muted, setMuted] = useState(true);

  const [launchStatus, setLaunchStatus] = useState<"idle" | "loading" | "error">("idle");
  const [launchError, setLaunchError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);

  // Charge trailer/background/description en tâche de fond uniquement pour ce
  // jeu, uniquement quand la page est ouverte (pas de chargement anticipé
  // pour toute la bibliothèque, donc aucun impact sur les perfs ailleurs).
  useEffect(() => {
    let cancelled = false;
    setMedia(null);
    invoke<GameMedia>("fetch_game_media", { id: game.id }).then((m) => {
      if (!cancelled) setMedia(m);
    }).catch(() => {
      if (!cancelled) setMedia(null);
    });
    return () => {
      cancelled = true;
    };
  }, [game.id]);


  function toggleMute() {
    setMuted((m) => {
      if (videoRef.current) videoRef.current.muted = !m;
      return !m;
    });
  }

  async function handleLaunch() {
    setError(null);
    setLaunchStatus("loading");
    const start = Date.now();
    try {
      await invoke("launch_game", { id: game.id });
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 1100 - elapsed);
      setTimeout(() => setLaunchStatus("idle"), remaining);
      notify("Jeu lancé", "success");
      onLaunched();
    } catch (e) {
      notify(`Erreur : ${e}`, "error");
      setLaunchError(String(e));
      setLaunchStatus("error");
      setError(String(e));
    }
  }

  async function handleOpenFolder() {
    try {
      await invoke("open_in_explorer", { path: game.folder_path });
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleChangeCover() {
    setError(null);
    const selected = await open({
      multiple: false,
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }],
    });
    if (typeof selected !== "string") return;
    try {
      await invoke("set_game_cover", { id: game.id, imagePath: selected });
      onLaunched();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRemove() {
    if (!confirm(`Retirer "${game.name}" de Nyro ? (le jeu ne sera pas désinstallé)`)) return;
    await invoke("remove_game", { id: game.id });
    notify(`"${game.name}" retiré de Nyro`, "info");
    onRemoved();
  }

  const heroMediaUrl =
    media?.trailer_url || media?.trailer_youtube_id ? null : media?.background_url ?? game.cover_image;

  return (
    <div className="page-enter relative">
      {launchStatus !== "idle" && (
        <LaunchScreen
          gameName={game.name}
          trailerUrl={media?.trailer_url ?? null}
          backgroundUrl={media?.background_url ?? null}
          coverImage={game.cover_image}
          logoImage={game.logo_image}
          status={launchStatus === "error" ? "error" : "loading"}
          errorMessage={launchError ?? undefined}
          onClose={() => setLaunchStatus("idle")}
        />
      )}

      <div className="p-8 pb-0">
        <button onClick={onBack} className="nyro-btn text-xs px-3 py-1.5 text-nexus-muted hover:text-nexus-text">
          Retour à la bibliothèque
        </button>
      </div>

      <div className="relative w-full min-h-[360px] overflow-hidden mt-6 border-y border-nexus-border bg-nexus-panel">
        {media?.trailer_url ? (
          <video
            ref={videoRef}
            autoPlay
            muted={muted}
            loop
            playsInline
            src={media.trailer_url}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : media?.trailer_youtube_id ? (
          <iframe
            src={`https://www.youtube.com/embed/${media.trailer_youtube_id}?autoplay=1&mute=1&loop=1&playlist=${media.trailer_youtube_id}&controls=0&showinfo=0&modestbranding=1&rel=0`}
            title="Trailer"
            allow="autoplay; encrypted-media"
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ transform: "scale(1.25)" }}
          />
        ) : heroMediaUrl ? (
          <div
            style={{ backgroundImage: `url(${heroMediaUrl})`, backgroundSize: "cover", backgroundPosition: "center" }}
            className="absolute inset-0 w-full h-full"
          />
        ) : (
          <div className="absolute inset-0 w-full h-full bg-nexus-panel2" />
        )}

        {/* Dégradés pour la lisibilité du texte */}
        <div className="absolute inset-0 bg-gradient-to-t from-nexus-bg via-nexus-bg/55 to-transparent" />

        {media?.trailer_url && (
          <button
            onClick={toggleMute}
            className="absolute top-4 right-4 z-20 nyro-btn text-xs px-3 py-1.5"
          >
            {muted ? "🔇 Son coupé" : "🔊 Son activé"}
          </button>
        )}
        {media?.trailer_youtube_id && !media?.trailer_url && (
          <span className="absolute top-4 right-4 z-20 nyro-panel-muted text-xs px-3 py-1.5 text-nexus-muted">
            Trailer YouTube (muet)
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 z-10 p-8 flex flex-col gap-4">
          <div>
            {game.logo_image ? (
              <img
                src={game.logo_image}
                alt={game.name}
                className="max-h-24 max-w-sm object-contain"
              />
            ) : (
              <h1 className="text-4xl font-semibold tracking-tight leading-none">{game.name}</h1>
            )}
          </div>

          <p className="text-sm text-nexus-muted">{game.category || "Non catégorisé"}</p>

          <div className="flex gap-3 items-center flex-wrap">
            <button
              onClick={handleLaunch}
              className="nyro-btn-strong px-6 py-3 text-sm font-semibold"
            >
              <span className="text-base leading-none">▶</span>
              Jouer
            </button>
            <button
              onClick={handleOpenFolder}
              className="nyro-btn px-4 py-3 text-sm font-medium"
            >
              Ouvrir le dossier
            </button>
            <div className="w-px h-8 bg-nexus-border mx-1" />
            <button
              onClick={handleChangeCover}
              className="nyro-btn text-xs px-3 py-2.5"
            >
              {game.cover_image ? "Changer la cover" : "Ajouter une cover"}
            </button>
            <button
              onClick={() => setShowOnlineSearch(true)}
              className="nyro-btn text-xs px-3 py-2.5"
            >
              Média en ligne
            </button>
            {game.active_profile_id && (
              <span className="text-xs text-nexus-muted">
                Profil actif : {game.profiles.find((p) => p.id === game.active_profile_id)?.name}
              </span>
            )}
          </div>
        </div>
      </div>

      {showOnlineSearch && (
        <OnlineMediaSearch game={game} onClose={() => setShowOnlineSearch(false)} onApplied={onLaunched} />
      )}

      <div className="p-8 space-y-6 max-w-2xl">
        {error && (
          <div className="bg-nexus-danger/10 border border-nexus-danger/40 rounded-lg p-3 text-sm text-nexus-danger">
            {error}
          </div>
        )}

        {media && (media.description || media.genres.length > 0) && (
          <div className="nyro-panel p-5 space-y-2 text-sm">
            {media.description && <p className="text-nexus-muted">{media.description}</p>}
            {media.genres.length > 0 && (
              <div className="flex justify-between">
                <span className="text-nexus-muted">Genres</span>
                <span>{media.genres.join(", ")}</span>
              </div>
            )}
            {media.developers.length > 0 && (
              <div className="flex justify-between">
                <span className="text-nexus-muted">Développeur</span>
                <span>{media.developers.join(", ")}</span>
              </div>
            )}
            {media.publishers.length > 0 && (
              <div className="flex justify-between">
                <span className="text-nexus-muted">Éditeur</span>
                <span>{media.publishers.join(", ")}</span>
              </div>
            )}
            {media.release_date && (
              <div className="flex justify-between">
                <span className="text-nexus-muted">Date de sortie</span>
                <span>{media.release_date}</span>
              </div>
            )}
          </div>
        )}

        <div className="nyro-panel p-5 space-y-2 text-sm">
          {developerMode && (
            <>
              <div className="flex justify-between gap-4">
                <span className="text-nexus-muted">Emplacement</span>
                <span className="truncate max-w-xs" title={game.folder_path}>
                  {game.folder_path}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-nexus-muted">Exécutable</span>
                <span className="truncate max-w-xs" title={game.executable_path}>
                  {game.executable_path}
                </span>
              </div>
            </>
          )}
          <div className="flex justify-between">
            <span className="text-nexus-muted">Dernier lancement</span>
            <span>{game.last_played ? new Date(game.last_played).toLocaleString("fr-FR") : "Jamais"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-nexus-muted">Temps de jeu total</span>
            <span>{formatPlaytime(game.total_playtime_seconds)}</span>
          </div>
        </div>

        <ModsManager game={game} onChanged={onLaunched} />

        <SteamAchievements game={game} />

        <GameProfiles game={game} onSaved={onLaunched} />

        <button onClick={handleRemove} className="text-xs text-nexus-danger hover:underline">
          Retirer ce jeu de Nyro
        </button>
      </div>
    </div>
  );
}
