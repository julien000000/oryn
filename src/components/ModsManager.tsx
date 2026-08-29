import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Game } from "../types";
import { notify } from "../notify";

interface ModsManagerProps {
  game: Game;
  onChanged: () => void;
}

export default function ModsManager({ game, onChanged }: ModsManagerProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pickModsFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected !== "string") return;
    try {
      await invoke("set_mods_folder", { id: game.id, path: selected });
      onChanged();
    } catch (e) {
      setError(String(e));
    }
  }

  async function addModFromFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected !== "string") return;
    const name = prompt("Nom du mod :", selected.split("\\").pop() ?? "Mod");
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await invoke("add_mod", { id: game.id, sourcePath: selected, name });
      onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function addModFromFile() {
    const selected = await open({ multiple: false });
    if (typeof selected !== "string") return;
    const name = prompt("Nom du mod :", selected.split("\\").pop() ?? "Mod");
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await invoke("add_mod", { id: game.id, sourcePath: selected, name });
      onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(modId: string, enable: boolean) {
    setError(null);
    try {
      await invoke("toggle_mod", { id: game.id, modId, enable });
      notify(enable ? "Mod activé" : "Mod désactivé", "success");
      onChanged();
    } catch (e) {
      notify(`Erreur : ${e}`, "error");
      setError(String(e));
    }
  }

  async function remove(modId: string, name: string) {
    if (!confirm(`Supprimer définitivement le mod "${name}" ?`)) return;
    try {
      await invoke("delete_mod", { id: game.id, modId });
      onChanged();
    } catch (e) {
      setError(String(e));
    }
  }

  async function openFolder(path: string) {
    await invoke("open_in_explorer", { path });
  }

  return (
    <div className="bg-nexus-panel border border-nexus-border rounded-xl2 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-nexus-muted">GESTIONNAIRE DE MODS</p>
        <div className="flex gap-2">
          <button onClick={addModFromFolder} disabled={busy} className="text-xs text-nexus-accent2 hover:underline disabled:opacity-50">
            + Ajouter (dossier)
          </button>
          <button onClick={addModFromFile} disabled={busy} className="text-xs text-nexus-accent2 hover:underline disabled:opacity-50">
            + Ajouter (fichier)
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-nexus-muted">Dossier mods du jeu :</span>
        <span className="flex-1 truncate" title={game.mods_folder ?? ""}>
          {game.mods_folder ?? "Non configuré"}
        </span>
        <button
          onClick={pickModsFolder}
          className="bg-nexus-panel2 border border-nexus-border px-2 py-1 rounded hover:border-nexus-accent"
        >
          {game.mods_folder ? "Changer" : "Choisir"}
        </button>
      </div>

      {error && <p className="text-xs text-nexus-danger">{error}</p>}

      {game.mods.length === 0 ? (
        <p className="text-sm text-nexus-muted">Aucun mod ajouté pour ce jeu.</p>
      ) : (
        <div className="space-y-1">
          {game.mods.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-nexus-panel2">
              <input
                type="checkbox"
                checked={m.enabled}
                onChange={(e) => toggle(m.id, e.target.checked)}
                className="accent-nexus-accent"
              />
              <span className="flex-1 text-sm truncate">{m.name}</span>
              {m.enabled && (
                <span className="text-[10px] bg-nexus-success/20 text-nexus-success px-1.5 py-0.5 rounded">
                  actif
                </span>
              )}
              <button onClick={() => openFolder(m.storage_path)} className="text-xs text-nexus-muted hover:text-nexus-text">
                Ouvrir
              </button>
              <button onClick={() => remove(m.id, m.name)} className="text-xs text-nexus-danger hover:underline">
                Suppr.
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
