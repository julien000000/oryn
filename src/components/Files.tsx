import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FileEntry, Favorite } from "../types";
import { notify } from "../notify";

interface FilesProps {
  favorites: Favorite[];
  onFavoritesChanged: () => void;
  initialPath?: string | null;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "—";
  const units = ["o", "Ko", "Mo", "Go"];
  let val = bytes;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function Files({ favorites, onFavoritesChanged, initialPath }: FilesProps) {
  const [currentPath, setCurrentPath] = useState<string>(initialPath || "C:\\");
  const [pathInput, setPathInput] = useState<string>(initialPath || "C:\\");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<{ path: string; mode: "copy" | "move" } | null>(null);
  const [search, setSearch] = useState("");
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    const unlisten = listen<{ done: number; total: number }>("archive-progress", (e) => {
      setProgress(e.payload);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  async function load(path: string) {
    setError(null);
    try {
      const result = await invoke<FileEntry[]>("list_directory", { path });
      setEntries(result);
      setCurrentPath(path);
      setPathInput(path);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    load(currentPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialPath) {
      load(initialPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPath]);

  function goUp() {
    const parts = currentPath.replace(/\\$/, "").split("\\");
    if (parts.length <= 1) return;
    parts.pop();
    const parent = parts.join("\\") + "\\";
    load(parent);
  }

  async function handleNewFolder() {
    const name = prompt("Nom du nouveau dossier :");
    if (!name) return;
    try {
      await invoke("create_folder", { parent: currentPath, name });
      load(currentPath);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleNewFile() {
    const name = prompt("Nom du nouveau fichier :");
    if (!name) return;
    try {
      await invoke("create_file_entry", { parent: currentPath, name });
      load(currentPath);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRename(entry: FileEntry) {
    const newName = prompt("Nouveau nom :", entry.name);
    if (!newName || newName === entry.name) return;
    try {
      await invoke("rename_entry", { path: entry.path, newName });
      load(currentPath);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDelete(entry: FileEntry) {
    if (!confirm(`Supprimer définitivement "${entry.name}" ?`)) return;
    try {
      await invoke("delete_entry", { path: entry.path });
      notify("Fichier supprimé", "info");
      load(currentPath);
    } catch (e) {
      notify(`Erreur : ${e}`, "error");
      setError(String(e));
    }
  }

  async function handleExtract(entry: FileEntry) {
    const destName = entry.name.replace(/\.(zip|rar|7z)$/i, "");
    const destPath = `${currentPath}${currentPath.endsWith("\\") ? "" : "\\"}${destName}`;
    setBusyPath(entry.path);
    setProgress({ done: 0, total: 0 });
    try {
      await invoke("extract_archive", { zipPath: entry.path, destDir: destPath });
      notify(`Archive extraite dans "${destName}"`, "success");
      load(currentPath);
    } catch (e) {
      notify(`Erreur : ${e}`, "error");
      setError(String(e));
    } finally {
      setBusyPath(null);
      setProgress(null);
    }
  }

  async function handleCompress(entry: FileEntry) {
    const zipName = entry.name.replace(/\.[^.]+$/, "") + ".zip";
    const zipPath = `${currentPath}${currentPath.endsWith("\\") ? "" : "\\"}${zipName}`;
    setBusyPath(entry.path);
    setProgress({ done: 0, total: 0 });
    try {
      await invoke("compress_to_archive", { sourcePath: entry.path, zipDest: zipPath });
      notify(`"${zipName}" créé`, "success");
      load(currentPath);
    } catch (e) {
      notify(`Erreur : ${e}`, "error");
      setError(String(e));
    } finally {
      setBusyPath(null);
      setProgress(null);
    }
  }

  async function handlePaste() {
    if (!clipboard) return;
    try {
      const command = clipboard.mode === "copy" ? "copy_entry" : "move_entry";
      await invoke(command, { source: clipboard.path, destinationDir: currentPath });
      setClipboard(null);
      load(currentPath);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleAddFavorite() {
    const name = prompt("Nom du favori :", currentPath.split("\\").filter(Boolean).pop() ?? currentPath);
    if (!name) return;
    await invoke("add_favorite", { name, path: currentPath });
    onFavoritesChanged();
  }

  async function handleRemoveFavorite(id: string) {
    await invoke("remove_favorite", { id });
    onFavoritesChanged();
  }

  const filtered = search
    ? entries.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
    : entries;

  return (
    <div className="page-enter h-full flex">
      {/* Favoris */}
      <aside className="w-56 shrink-0 border-r border-nexus-border p-4 space-y-2 overflow-y-auto bg-nexus-panel/40">
        <div className="flex items-center justify-between mb-2">
          <p className="nyro-section-title">Favoris</p>
          <button onClick={handleAddFavorite} title="Ajouter le dossier actuel" className="text-xs text-nexus-accent hover:text-nexus-text transition-colors">
            Ajouter
          </button>
        </div>
        {favorites.length === 0 && <p className="text-xs text-nexus-muted">Aucun favori</p>}
        {favorites.map((f) => (
          <div key={f.id} className="group flex items-center justify-between text-sm">
            <button
              onClick={() => load(f.path)}
              className="truncate text-left flex-1 text-nexus-muted hover:text-nexus-text transition-colors"
              title={f.path}
            >
              {f.name}
            </button>
            <button
              onClick={() => handleRemoveFavorite(f.id)}
              className="opacity-0 group-hover:opacity-100 text-nexus-danger text-xs px-1"
            >
              ✕
            </button>
          </div>
        ))}
      </aside>

      {/* Explorateur */}
      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={goUp} className="nyro-btn px-2.5 py-1.5 text-sm">
            ↑
          </button>
          <input
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(pathInput)}
            className="nyro-input flex-1 px-3 py-2 text-sm"
          />
          <button
            onClick={() => load(pathInput)}
            className="nyro-btn px-3 py-2 text-sm"
          >
            Aller
          </button>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrer ce dossier"
            className="nyro-input flex-1 px-3 py-2 text-sm"
          />
          <button onClick={handleNewFolder} className="nyro-btn text-xs px-3 py-2">
            Nouveau dossier
          </button>
          <button onClick={handleNewFile} className="nyro-btn text-xs px-3 py-2">
            Nouveau fichier
          </button>
          {clipboard && (
            <button onClick={handlePaste} className="nyro-btn-strong text-xs px-3 py-2">
              Coller ({clipboard.mode === "copy" ? "copie" : "déplacement"})
            </button>
          )}
        </div>

        {error && (
          <div className="bg-nexus-danger/10 border border-nexus-danger/40 rounded-lg p-3 text-sm text-nexus-danger mb-3">
            {error}
          </div>
        )}

        {busyPath && progress && (
          <div className="nyro-panel p-3 mb-3 space-y-1.5">
            <div className="flex justify-between text-xs text-nexus-muted">
              <span>{progress.total > 0 ? "Traitement en cours..." : "Traitement en cours (7-Zip)..."}</span>
              <span>{progress.total > 0 ? `${progress.done} / ${progress.total} (${Math.round((progress.done / progress.total) * 100)}%)` : "..."}</span>
            </div>
            <div className="w-full h-1.5 bg-nexus-panel2 rounded-full overflow-hidden">
              {progress.total > 0 ? (
                <div
                  className="h-full bg-nexus-accent rounded-full transition-all duration-200"
                  style={{ width: `${Math.min(100, (progress.done / progress.total) * 100)}%` }}
                />
              ) : (
                <div className="h-full w-1/3 bg-nexus-accent rounded-full animate-pulse" />
              )}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto border border-nexus-border rounded-lg bg-nexus-panel">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-nexus-panel text-nexus-muted text-xs">
              <tr>
                <th className="text-left font-normal px-3 py-2">Nom</th>
                <th className="text-left font-normal px-3 py-2 w-24">Taille</th>
                <th className="text-left font-normal px-3 py-2 w-40">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry.path} className="border-t border-nexus-border hover:bg-nexus-panel2/50">
                  <td
                    className="px-3 py-2 cursor-pointer truncate max-w-xs"
                    onClick={() => entry.is_dir && load(entry.path)}
                  >
                    {entry.is_dir ? "📁" : "📄"} {entry.name}
                  </td>
                  <td className="px-3 py-2 text-nexus-muted">{entry.is_dir ? "—" : formatSize(entry.size)}</td>
                  <td className="px-3 py-2 flex gap-2 text-xs">
                    <button onClick={() => setClipboard({ path: entry.path, mode: "copy" })} className="text-nexus-muted hover:text-nexus-text">
                      Copier
                    </button>
                    <button onClick={() => setClipboard({ path: entry.path, mode: "move" })} className="text-nexus-muted hover:text-nexus-text">
                      Déplacer
                    </button>
                    <button onClick={() => handleRename(entry)} className="text-nexus-muted hover:text-nexus-text">
                      Renommer
                    </button>
                    {!entry.is_dir && /\.(zip|rar|7z)$/i.test(entry.name) ? (
                      <button
                        onClick={() => handleExtract(entry)}
                        disabled={busyPath === entry.path}
                        className="text-nexus-accent2 hover:underline disabled:opacity-50"
                      >
                        {busyPath === entry.path ? "⏳ Extraction..." : "📦 Extraire"}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleCompress(entry)}
                        disabled={busyPath === entry.path}
                        className="text-nexus-muted hover:text-nexus-text disabled:opacity-50"
                      >
                        {busyPath === entry.path ? "⏳ Compression..." : "📦 Compresser"}
                      </button>
                    )}
                    <button onClick={() => handleDelete(entry)} className="text-nexus-danger hover:underline">
                      Suppr.
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-nexus-muted text-sm">
                    Ce dossier est vide.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
