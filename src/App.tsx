import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import AddGameModal from "./components/AddGameModal";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import GameLibrary from "./components/GameLibrary";
import GamePage from "./components/GamePage";
import Files from "./components/Files";
import SystemMonitor from "./components/SystemMonitor";
import Ranking from "./components/Ranking";
import GlobalSearch from "./components/GlobalSearch";
import Settings from "./components/Settings";
import Notifications from "./components/Notifications";
import UpdateChecker from "./components/UpdateChecker";
import TutorialOverlay from "./components/TutorialOverlay";
import { notify } from "./notify";
import { AppConfig, View } from "./types";

export default function App() {
  const [view, setView] = useState<View>("home");
  const [collapsed, setCollapsed] = useState(false);
  const [config, setConfig] = useState<AppConfig>({
    games: [],
    favorites: [],
    settings: {
      theme: "dark",
      accent_color: null,
      reduce_animations: false,
      developer_mode: false,
      steamgriddb_api_key: null,
      steam_api_key: null,
      steam_id64: null,
      youtube_api_key: null,
      igdb_client_id: null,
      igdb_client_secret: null,
      ignored_update_version: null,
    },
  });
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [targetFolder, setTargetFolder] = useState<string | null>(null);
  const [droppedExePath, setDroppedExePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  async function refresh() {
    const cfg = await invoke<AppConfig>("get_config");
    setConfig(cfg);
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    type PendingAction = { type: "AddGame" | "OpenFolder"; path: string } | null;
    function handlePendingAction(action: PendingAction) {
      if (!action) return;
      if (action.type === "AddGame") {
        setDroppedExePath(action.path);
      } else if (action.type === "OpenFolder") {
        setTargetFolder(action.path);
        if (config.settings.developer_mode) {
          setView("files");
        }
      }
    }
    invoke<PendingAction>("get_pending_action").then(handlePendingAction);
    const unlisten = listen<PendingAction>("pending-action", (e) => handlePendingAction(e.payload));
    return () => {
      unlisten.then((f) => f());
    };
  }, [config.settings.developer_mode]);

  useEffect(() => {
    const unlisten = listen<string>("navigate", (event) => {
      setView(event.payload as View);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    const webview = getCurrentWebviewWindow();
    const unlisten = webview.onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        const exePath = event.payload.paths.find((p) => p.toLowerCase().endsWith(".exe"));
        if (exePath) {
          setDroppedExePath(exePath);
        }
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = config.settings.theme;
    if (config.settings.accent_color) {
      root.style.setProperty("--nexus-accent", config.settings.accent_color);
    } else {
      root.style.removeProperty("--nexus-accent");
    }
    document.body.classList.toggle("reduce-motion", config.settings.reduce_animations);
  }, [config.settings]);

  function openGame(id: string) {
    setSelectedGameId(id);
    setView("game-detail");
  }

  useEffect(() => {
    if (!config.settings.developer_mode && view === "files") {
      setView("home");
    }
  }, [config.settings.developer_mode, view]);

  const selectedGame = config.games.find((g) => g.id === selectedGameId) ?? null;

  if (loading) {
    return (
      <div className="h-screen bg-nexus-bg flex items-center justify-center text-nexus-muted text-sm">
        Chargement de Nyro...
      </div>
    );
  }

  return (
    <div className="nyro-shell h-screen flex flex-col bg-nexus-bg text-nexus-text overflow-hidden">
      <UpdateChecker settings={config.settings} onSettingsChanged={refresh} />
      <div className="flex flex-1 min-h-0">
      <Sidebar
        current={view}
        onNavigate={setView}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        developerMode={config.settings.developer_mode}
      />
      <main className="flex-1 overflow-y-auto">
        {view === "home" && (
          <Dashboard
            games={config.games}
            onOpenGame={openGame}
            onOpenTutorial={() => setTutorialOpen(true)}
            onLaunchGame={async (id) => {
              try {
                await invoke("launch_game", { id });
                notify("Jeu lancé", "success");
              } catch (e) {
                notify(`Erreur : ${e}`, "error");
              }
              await refresh();
            }}
            onGoToLibrary={() => setView("games")}
          />
        )}
        {view === "games" && (
          <GameLibrary games={config.games} onOpenGame={openGame} onGameAdded={refresh} />
        )}
        {view === "ranking" && <Ranking games={config.games} onOpenGame={openGame} />}
        {view === "game-detail" && selectedGame && (
          <GamePage
            game={selectedGame}
            onBack={() => setView("games")}
            onLaunched={refresh}
            developerMode={config.settings.developer_mode}
            onRemoved={() => {
              setView("games");
              refresh();
            }}
          />
        )}
        {view === "files" && config.settings.developer_mode && (
          <Files favorites={config.favorites} onFavoritesChanged={refresh} initialPath={targetFolder} />
        )}
        {view === "pc" && <SystemMonitor />}
        {view === "settings" && <Settings settings={config.settings} onChanged={refresh} />}
      </main>
      </div>
      <GlobalSearch
        onOpenGame={openGame}
        onNavigateToFolder={(path) => {
          setTargetFolder(path);
          if (config.settings.developer_mode) {
            setView("files");
          }
        }}
      />
      <Notifications />
      <TutorialOverlay
        open={tutorialOpen}
        currentView={view}
        onClose={() => setTutorialOpen(false)}
        onNavigate={setView}
      />
      {droppedExePath && (
        <AddGameModal
          initialExePath={droppedExePath}
          onClose={() => setDroppedExePath(null)}
          onAdded={() => {
            setDroppedExePath(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
