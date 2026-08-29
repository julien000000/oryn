import { View } from "../types";
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
}

const ITEMS: { view: View; icon: string; label: string; developerOnly?: boolean; removeGreenScreen?: boolean }[] = [
  { view: "home", icon: accueilIcon, label: "Accueil", removeGreenScreen: true },
  { view: "games", icon: jeuxIcon, label: "Jeux", removeGreenScreen: true },
  { view: "ranking", icon: classementIcon, label: "Classement", removeGreenScreen: true },
  { view: "files", icon: fichiersIcon, label: "Fichiers", developerOnly: true, removeGreenScreen: true },
  { view: "pc", icon: pcIcon, label: "PC", removeGreenScreen: true },
  { view: "settings", icon: parametresIcon, label: "Paramètres", removeGreenScreen: true },
];

export default function Sidebar({ current, onNavigate, collapsed, onToggleCollapsed, developerMode }: SidebarProps) {
  return (
    <aside
      className={`nyro-sidebar h-screen shrink-0 border-r border-nexus-border flex flex-col py-4 transition-all duration-150 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      <div className="px-4 mb-7 flex items-center justify-between">
        {!collapsed && (
          <div className="leading-tight">
            <span className="block font-semibold tracking-[0.18em] text-[11px] uppercase text-nexus-muted">Launcher</span>
            <span className="block font-semibold tracking-[0.08em] text-base text-nexus-text">Nyro</span>
          </div>
        )}
        <button
          onClick={onToggleCollapsed}
          className="nyro-btn text-nexus-muted hover:text-nexus-text text-lg leading-none w-8 h-8"
          title="Réduire / agrandir"
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <nav className="flex-1 flex flex-col gap-1.5 px-2">
        {ITEMS.filter((item) => !item.developerOnly || developerMode).map((item) => (
          <button
            key={item.view}
            data-tutorial-id={item.view === "ranking" ? "tutorial-sidebar-ranking" : undefined}
            onClick={() => onNavigate(item.view)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm border transition-colors ${
              current === item.view
                ? "bg-nexus-panel2 text-nexus-text border-nexus-border"
                : "text-nexus-muted border-transparent hover:bg-nexus-panel2/70 hover:text-nexus-text"
            }`}
          >
            <SidebarIcon
              src={item.icon}
              alt=""
              removeGreenScreen={item.removeGreenScreen}
              className="w-[18px] h-[18px] object-contain shrink-0"
            />
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>
    </aside>
  );
}
