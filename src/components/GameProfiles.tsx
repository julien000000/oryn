import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Game, GameProfile } from "../types";

interface GameProfilesProps {
  game: Game;
  onSaved: () => void;
}

function newProfileId() {
  return `profile_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function GameProfiles({ game, onSaved }: GameProfilesProps) {
  const [profiles, setProfiles] = useState<GameProfile[]>(game.profiles);
  const [activeId, setActiveId] = useState<string | null>(game.active_profile_id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addProfile() {
    const name = prompt("Nom du profil (ex: Modded, Testing) :");
    if (!name) return;
    setProfiles((prev) => [
      ...prev,
      { id: newProfileId(), name, launch_args: "", executable_override: null, active_mod_ids: [] },
    ]);
  }

  function updateProfile(id: string, patch: Partial<GameProfile>) {
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function removeProfile(id: string) {
    setProfiles((prev) => prev.filter((p) => p.id !== id));
    if (activeId === id) setActiveId(null);
  }

  function toggleProfileMod(profileId: string, modId: string) {
    setProfiles((prev) =>
      prev.map((p) => {
        if (p.id !== profileId) return p;
        const has = p.active_mod_ids.includes(modId);
        return {
          ...p,
          active_mod_ids: has ? p.active_mod_ids.filter((id) => id !== modId) : [...p.active_mod_ids, modId],
        };
      })
    );
  }

  async function applyProfileMods(profileId: string) {
    setError(null);
    try {
      await invoke("save_game_profiles", { id: game.id, profiles, activeProfileId: activeId });
      await invoke("apply_profile_mods", { id: game.id, profileId });
      onSaved();
    } catch (e) {
      setError(String(e));
    }
  }

  async function pickExecutableOverride(id: string) {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Exécutable", extensions: ["exe"] }],
    });
    if (typeof selected === "string") {
      updateProfile(id, { executable_override: selected });
    }
  }

  async function saveProfiles() {
    setSaving(true);
    setError(null);
    try {
      await invoke("save_game_profiles", {
        id: game.id,
        profiles,
        activeProfileId: activeId,
      });
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-nexus-panel border border-nexus-border rounded-xl2 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-nexus-muted">PROFILS</p>
          <button onClick={addProfile} className="text-xs text-nexus-accent2 hover:underline">
            + Nouveau profil
          </button>
        </div>

        {profiles.length === 0 && (
          <p className="text-sm text-nexus-muted">
            Aucun profil. Crée-en un pour changer les arguments/exécutable selon le contexte (Vanilla,
            Modded, Testing...).
          </p>
        )}

        <div className="space-y-3">
          {profiles.map((p) => (
            <div
              key={p.id}
              className={`border rounded-xl2 p-3 space-y-2 ${
                activeId === p.id ? "border-nexus-accent" : "border-nexus-border"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    checked={activeId === p.id}
                    onChange={() => setActiveId(p.id)}
                    className="accent-nexus-accent"
                  />
                  <span className="font-medium">{p.name}</span>
                  {activeId === p.id && (
                    <span className="text-[10px] bg-nexus-accent/20 text-nexus-accent2 px-1.5 py-0.5 rounded">
                      actif
                    </span>
                  )}
                </label>
                <button onClick={() => removeProfile(p.id)} className="text-xs text-nexus-danger hover:underline">
                  Supprimer
                </button>
              </div>

              <input
                value={p.launch_args}
                onChange={(e) => updateProfile(p.id, { launch_args: e.target.value })}
                placeholder="Arguments de lancement pour ce profil"
                className="w-full bg-nexus-panel2 border border-nexus-border rounded-lg px-3 py-1.5 text-xs font-mono"
              />

              <div className="flex items-center gap-2">
                <span className="text-xs text-nexus-muted truncate flex-1" title={p.executable_override ?? ""}>
                  {p.executable_override ? p.executable_override : "Exécutable par défaut du jeu"}
                </span>
                <button
                  onClick={() => pickExecutableOverride(p.id)}
                  className="text-xs bg-nexus-panel2 border border-nexus-border px-2 py-1 rounded hover:border-nexus-accent"
                >
                  Changer
                </button>
                {p.executable_override && (
                  <button
                    onClick={() => updateProfile(p.id, { executable_override: null })}
                    className="text-xs text-nexus-muted hover:text-nexus-text"
                  >
                    Réinitialiser
                  </button>
                )}
              </div>

              {game.mods.length > 0 && (
                <div className="border-t border-nexus-border pt-2 space-y-1">
                  <p className="text-[10px] text-nexus-muted">MODS DE CE PROFIL</p>
                  {game.mods.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={p.active_mod_ids.includes(m.id)}
                        onChange={() => toggleProfileMod(p.id, m.id)}
                        className="accent-nexus-accent"
                      />
                      <span>{m.name}</span>
                    </label>
                  ))}
                  <button
                    onClick={() => applyProfileMods(p.id)}
                    className="text-xs text-nexus-accent2 hover:underline mt-1"
                  >
                    ⚡ Appliquer ces mods maintenant
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {profiles.length > 0 && (
          <button
            onClick={() => setActiveId(null)}
            className={`text-xs ${activeId === null ? "text-nexus-accent2" : "text-nexus-muted hover:text-nexus-text"}`}
          >
            {activeId === null ? "✓ " : ""}Aucun profil actif (utiliser les réglages par défaut)
          </button>
        )}

        {error && <p className="text-xs text-nexus-danger">{error}</p>}

        <button
          onClick={saveProfiles}
          disabled={saving}
          className="bg-nexus-accent hover:opacity-90 transition-opacity px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Enregistrement..." : "Enregistrer les profils"}
        </button>
      </div>
    </div>
  );
}
