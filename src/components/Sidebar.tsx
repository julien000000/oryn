import { useRef } from "react";
import { View, Settings } from "../types";
import SidebarIcon from "./SidebarIcon";
import accueilIcon from "../../emojis/accueil.png";
import jeuxIcon from "../../emojis/jeux.png";
import classementIcon from "../../emojis/classement.png";
import fichiersIcon from "../../emojis/fichiers.png";
import pcIcon from "../../emojis/pc.png";
import parametresIcon from "../../emojis/parametres.png";

interface SidebarProps {
  current: View;
  onNavigate: (view: View) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  developerMode: boolean;
  profile: { name: string; avatar: string | null };
  theme: Settings["theme"];
  onToggleTheme: () => void;
  onChaos: () => void;
}

const ITEMS: { view: View; icon: string; label: string; developerOnly?: boolean }[] = [
  { view: "home", icon: accueilIcon, label: "Accueil" },
  { view: "games", icon: jeuxIcon, label: "Bibliothèque" },
  { view: "ranking", icon: classementIcon, label: "Classement" },
  { view: "files", icon: fichiersIcon, label: "Fichiers", developerOnly: true },
  { view: "pc", icon: pcIcon, label: "PC" },
  { view: "settings", icon: parametresIcon, label: "Paramètres" },
];

export default function Sidebar({ current, onNavigate, collapsed, onToggleCollapsed, developerMode, profile, theme, onToggleTheme, onChaos }: SidebarProps) {
  const pcClicks = useRef<number[]>([]);

  function handlePcClick() {
    const now = Date.now();
    const previous = pcClicks.current;
    pcClicks.current = previous.length && now - previous[previous.length - 1] <= 1000 ? [...previous, now] : [now];
    if (pcClicks.current.length >= 10) {
      pcClicks.current = [];
      onChaos();
    }
    onNavigate("pc");
  }
  const avatarIsImage = profile.avatar?.startsWith("data:image/");
  return (
    <aside className={`nyro-sidebar h-screen shrink-0 flex flex-col transition-all duration-200 ${collapsed ? "w-20" : "w-[250px]"}`}>
      <div className="nyro-sidebar-profile">
        <div className="nyro-profile-avatar">{avatarIsImage ? <img src={profile.avatar!} alt="" /> : <span>{profile.avatar || profile.name.charAt(0).toUpperCase()}</span>}</div>
        {!collapsed && <div className="nyro-profile-copy"><span>Bonjour,</span><strong>{profile.name}</strong><small><i /> En ligne</small></div>}
        <button onClick={onToggleCollapsed} className="nyro-collapse" title="Réduire / agrandir">{collapsed ? "›" : "‹"}</button>
      </div>
      <nav className="nyro-nav flex-1">
        {ITEMS.filter((item) => !item.developerOnly || developerMode).map((item) => (
          <button key={item.view} data-tutorial-id={item.view === "ranking" ? "tutorial-sidebar-ranking" : undefined} onClick={() => item.view === "pc" ? handlePcClick() : onNavigate(item.view)} className={`nyro-nav-item ${current === item.view ? "active" : ""}`} title={collapsed ? item.label : undefined}>
            <SidebarIcon src={item.icon} alt="" removeGreenScreen className="w-[20px] h-[20px] object-contain shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>
      <div className="nyro-sidebar-bottom">
        <button onClick={onToggleTheme} title={theme === "light" ? "Passer en mode sombre" : "Passer en mode clair"} aria-label={theme === "light" ? "Passer en mode sombre" : "Passer en mode clair"}>
          {theme === "light" ? "☀" : "☾"}
        </button>
      </div>
    </aside>
  );
}
