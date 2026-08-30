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
import ProfileSetup from "./components/ProfileSetup";
import { notify } from "./notify";
import { AppConfig, View } from "./types";

interface UserProfile {
  name: string;
  avatar: string | null;
}

const PROFILE_STORAGE_KEY = "nyro.user-profile";

function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY) || localStorage.getItem("oryn.user-profile");
    if (!raw) return null;
    const profile = JSON.parse(raw) as UserProfile;
    return profile?.name?.trim() ? profile : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [view, setView] = useState<View>("home");
  const [collapsed, setCollapsed] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(loadProfile);
  const [config, setConfig] = useState<AppConfig>({
    games: [], favorites: [],
    settings: {
      theme: "dark", accent_color: null, reduce_animations: false, developer_mode: false,
      steamgriddb_api_key: null, steam_api_key: null, steam_id64: null, youtube_api_key: null,
      igdb_client_id: null, igdb_client_secret: null, ignored_update_version: null,
    },
  });
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [targetFolder, setTargetFolder] = useState<string | null>(null);
  const [droppedExePath, setDroppedExePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [chaosMode, setChaosMode] = useState(false);

  async function refresh() {
    const cfg = await invoke<AppConfig>("get_config");
    setConfig(cfg);
  }

  useEffect(() => { refresh().finally(() => setLoading(false)); }, []);

  useEffect(() => {
    type PendingAction = { type: "AddGame" | "OpenFolder"; path: string } | null;
    function handlePendingAction(action: PendingAction) {
      if (!action) return;
      if (action.type === "AddGame") setDroppedExePath(action.path);
      else if (action.type === "OpenFolder") {
        setTargetFolder(action.path);
        if (config.settings.developer_mode) setView("files");
      }
    }
    invoke<PendingAction>("get_pending_action").then(handlePendingAction);
    const unlisten = listen<PendingAction>("pending-action", (e) => handlePendingAction(e.payload));
    return () => { unlisten.then((f) => f()); };
  }, [config.settings.developer_mode]);

  useEffect(() => {
    const unlisten = listen<string>("navigate", (event) => setView(event.payload as View));
    return () => { unlisten.then((f) => f()); };
  }, []);

  useEffect(() => {
    const webview = getCurrentWebviewWindow();
    const unlisten = webview.onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        const exePath = event.payload.paths.find((p) => p.toLowerCase().endsWith(".exe"));
        if (exePath) setDroppedExePath(exePath);
      }
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = config.settings.theme;
    if (config.settings.accent_color) root.style.setProperty("--nexus-accent", config.settings.accent_color);
    else root.style.removeProperty("--nexus-accent");
    document.body.classList.toggle("reduce-motion", config.settings.reduce_animations);
  }, [config.settings]);

  async function toggleTheme() {
    const next = config.settings.theme === "light" ? "dark" : "light";
    try {
      await invoke("update_settings", { settings: { ...config.settings, theme: next } });
      await refresh();
    } catch (e) {
      notify(`Erreur : ${e}`, "error");
    }
  }

  function openGame(id: string) { setSelectedGameId(id); setView("game-detail"); }

  function triggerChaos() {
    setChaosMode(true);
    window.setTimeout(() => setChaosMode(false), 4200);
  }

  useEffect(() => {
    if (!chaosMode) return;
    const root = document.querySelector(".nyro-shell");
    if (!root) return;
    const originals = new Map<Text, string>();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent || "";
      const parent = node.parentElement;
      if (!parent || parent.closest(".nyro-chaos-overlay") || !text.trim()) continue;
      nodes.push(node as Text);
    }
    nodes.forEach((textNode) => {
      const text = textNode.textContent || "";
      originals.set(textNode, text);
      const fragment = document.createDocumentFragment();
      [...text].forEach((character, index) => {
        if (/\\s/.test(character)) { fragment.appendChild(document.createTextNode(character)); return; }
        const span = document.createElement("span");
        span.className = "nyro-letter-drop";
        span.textContent = character;
        span.style.setProperty("--nyro-delay", `${Math.min(1.4, Math.random() * 1.15 + index * 0.012)}s`);
        span.style.setProperty("--nyro-drift", `${Math.round((Math.random() - .5) * 260)}px`);
        textNode.parentNode?.replaceChild(fragment, textNode);
        fragment.appendChild(span);
      });
    });
    return () => {
      document.querySelectorAll<HTMLElement>(".nyro-letter-drop").forEach((span) => span.replaceWith(document.createTextNode(span.textContent || "")));
    };
  }, [chaosMode]);

  function completeProfile(next: UserProfile) {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
    setProfile(next);
  }

  useEffect(() => {
    if (!config.settings.developer_mode && view === "files") setView("home");
  }, [config.settings.developer_mode, view]);

  const selectedGame = config.games.find((g) => g.id === selectedGameId) ?? null;

  if (loading) return <div className="app-loading"><div className="app-loading-mark">N</div><span>Chargement de Nyro...</span></div>;
  if (!profile) return <ProfileSetup onComplete={completeProfile} />;

  return (
    <div className={`nyro-shell h-screen flex flex-col bg-nexus-bg text-nexus-text overflow-hidden ${chaosMode ? "nyro-chaos" : ""}`}>
      <UpdateChecker settings={config.settings} onSettingsChanged={refresh} />
      <div className="flex flex-1 min-h-0">
        <Sidebar current={view} onNavigate={setView} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)} developerMode={config.settings.developer_mode} profile={profile} theme={config.settings.theme} onToggleTheme={toggleTheme} onChaos={triggerChaos} />
        <main className="nyro-main flex-1 overflow-y-auto">
          {view === "home" && <Dashboard games={config.games} onOpenGame={openGame} onOpenTutorial={() => setTutorialOpen(true)} profile={profile} onLaunchGame={async (id) => {
            try { await invoke("launch_game", { id }); notify("Jeu lancé", "success"); }
            catch (e) { notify(`Erreur : ${e}`, "error"); }
            await refresh();
          }} onGoToLibrary={() => setView("games")} />}
          {view === "games" && <GameLibrary games={config.games} onOpenGame={openGame} onGameAdded={refresh} />}
          {view === "ranking" && <Ranking games={config.games} onOpenGame={openGame} />}
          {view === "game-detail" && selectedGame && <GamePage game={selectedGame} onBack={() => setView("games")} onLaunched={refresh} developerMode={config.settings.developer_mode} onRemoved={() => { setView("games"); refresh(); }} />}
          {view === "files" && config.settings.developer_mode && <Files favorites={config.favorites} onFavoritesChanged={refresh} initialPath={targetFolder} />}
          {view === "pc" && <SystemMonitor />}
          {view === "settings" && <Settings settings={config.settings} onChanged={refresh} />}
        </main>
      </div>
      <GlobalSearch onOpenGame={openGame} onNavigateToFolder={(path) => { setTargetFolder(path); if (config.settings.developer_mode) setView("files"); }} />
      <Notifications />
      {chaosMode && <div className="nyro-chaos-overlay" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <img key={i} className={`nyro-chaos-gif nyro-chaos-gif-${i + 1}`} src="/assets/explosion.gif" alt="" />)}</div>}
      <TutorialOverlay open={tutorialOpen} currentView={view} onClose={() => setTutorialOpen(false)} onNavigate={setView} />
      {droppedExePath && <AddGameModal initialExePath={droppedExePath} onClose={() => setDroppedExePath(null)} onAdded={() => { setDroppedExePath(null); refresh(); }} />}
    </div>
  );
}
