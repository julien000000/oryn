import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { SearchResult } from "../types";

interface GlobalSearchProps {
  onOpenGame: (id: string) => void;
  onNavigateToFolder: (path: string) => void;
}

const KIND_ICON: Record<SearchResult["kind"], string> = {
  game: "🎮",
  favorite: "⭐",
  folder: "📁",
  file: "📄",
};

export default function GlobalSearch({ onOpenGame, onNavigateToFolder }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Écoute le raccourci global Ctrl+Space émis par le backend Rust,
  // fonctionne même si la fenêtre Nyro n'a pas le focus.
  useEffect(() => {
    const unlisten = listen("open-search", () => setOpen(true));
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // Fallback local : Ctrl+Space quand la fenêtre a déjà le focus, + Échap pour fermer
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.code === "Space") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
    } else {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      const r = await invoke<SearchResult[]>("global_search", { query });
      setResults(r);
    }, 120);
    return () => clearTimeout(timeout);
  }, [query]);

  function handleSelect(result: SearchResult) {
    setOpen(false);
    if (result.kind === "game" && result.game_id) {
      onOpenGame(result.game_id);
    } else if (result.kind === "folder" || result.kind === "favorite") {
      if (result.path) onNavigateToFolder(result.path);
    } else if (result.kind === "file" && result.path) {
      invoke("open_path", { path: result.path });
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-start justify-center pt-32 z-50"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-nexus-panel border border-nexus-border rounded-xl2 w-full max-w-lg overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un jeu, un dossier, un fichier..."
          className="w-full bg-transparent px-4 py-3 text-sm outline-none border-b border-nexus-border"
        />
        <div className="max-h-80 overflow-y-auto">
          {results.length === 0 && query.trim() && (
            <p className="text-xs text-nexus-muted px-4 py-3">Aucun résultat.</p>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.kind}-${r.path}-${i}`}
              onClick={() => handleSelect(r)}
              className="w-full text-left px-4 py-2 hover:bg-nexus-panel2 flex items-center gap-3"
            >
              <span>{KIND_ICON[r.kind]}</span>
              <span className="flex-1 min-w-0">
                <p className="text-sm truncate">{r.label}</p>
                <p className="text-xs text-nexus-muted truncate">{r.subtitle}</p>
              </span>
            </button>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-nexus-border text-xs text-nexus-muted">
          Ctrl+Space pour ouvrir · Échap pour fermer
        </div>
      </div>
    </div>
  );
}
