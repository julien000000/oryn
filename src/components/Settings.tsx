import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { enable as enableAutostart, disable as disableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import { open, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { Settings as SettingsType } from "../types";
import { notify } from "../notify";

interface SettingsProps {
  settings: SettingsType;
  onChanged: () => void;
}

const THEMES: { id: string; label: string; preview: string }[] = [
  { id: "dark", label: "🌑 Dark", preview: "linear-gradient(135deg, #0b0d12, #12151c)" },
  { id: "light", label: "☀️ Light", preview: "linear-gradient(135deg, #f4f5f7, #ffffff)" },
  { id: "midnight", label: "🌌 Midnight", preview: "linear-gradient(135deg, #05060a, #0a0c12)" },
];

const ACCENT_PRESETS = ["#2d64d6", "#4a8dff", "#1f4ea8", "#6fa8ff", "#16356f", "#89b8ff"];

export default function Settings({ settings, onChanged }: SettingsProps) {
  const [saving, setSaving] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(settings.steamgriddb_api_key ?? "");
  const [steamApiKeyInput, setSteamApiKeyInput] = useState(settings.steam_api_key ?? "");
  const [steamIdInput, setSteamIdInput] = useState(settings.steam_id64 ?? "");
  const [youtubeApiKeyInput, setYoutubeApiKeyInput] = useState(settings.youtube_api_key ?? "");
  const [igdbClientIdInput, setIgdbClientIdInput] = useState(settings.igdb_client_id ?? "");
  const [igdbClientSecretInput, setIgdbClientSecretInput] = useState(settings.igdb_client_secret ?? "");
  const [autostart, setAutostart] = useState(false);
  const [contextMenuInstalled, setContextMenuInstalled] = useState(false);

  useEffect(() => {
    isAutostartEnabled().then(setAutostart).catch(() => {});
    invoke<boolean>("is_context_menu_installed").then(setContextMenuInstalled);
  }, []);

  async function toggleContextMenu(install: boolean) {
    try {
      await invoke(install ? "install_context_menu" : "remove_context_menu");
      setContextMenuInstalled(install);
      notify(install ? "Menu contextuel installé" : "Menu contextuel retiré", "success");
    } catch (e) {
      notify(`Erreur : ${e}`, "error");
    }
  }

  async function toggleAutostart(checked: boolean) {
    try {
      if (checked) {
        await enableAutostart();
      } else {
        await disableAutostart();
      }
      setAutostart(checked);
    } catch (e) {
      notify(`Erreur : ${e}`, "error");
    }
  }

  async function openMiniMode() {
    await invoke("open_mini_mode");
  }

  async function exportConfig() {
    try {
      const config = await invoke("get_config");
      const path = await saveDialog({
        defaultPath: "Nyro_Backup.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await invoke("write_text_file", { path, content: JSON.stringify(config, null, 2) });
      notify("Sauvegarde exportée", "success");
    } catch (e) {
      notify(`Erreur : ${e}`, "error");
    }
  }

  async function importConfig() {
    if (
      !confirm(
        "Importer une sauvegarde va remplacer TOUTE ta bibliothèque actuelle (jeux, mods, paramètres) par celle du fichier choisi. Continuer ?"
      )
    ) {
      return;
    }
    const selected = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (typeof selected !== "string") return;
    try {
      const content = await invoke<string>("read_text_file", { path: selected });
      await invoke("import_config", { jsonContent: content });
      notify("Configuration importée — redémarre Nyro pour tout recharger", "success");
      onChanged();
    } catch (e) {
      notify(`Erreur : ${e}`, "error");
    }
  }

  async function save(patch: Partial<SettingsType>) {
    setSaving(true);
    try {
      await invoke("update_settings", { settings: { ...settings, ...patch } });
      onChanged();
      notify("Paramètres enregistrés", "success");
    } catch (e) {
      notify(`Erreur : ${e}`, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-enter p-8 space-y-8 max-w-3xl">
      <div className="space-y-1">
        <p className="nyro-section-title">Configuration</p>
        <h1 className="text-xl font-semibold">Paramètres</h1>
      </div>

      <div className="space-y-3">
        <p className="nyro-section-title">Apparence — thème</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => save({ theme: t.id })}
              disabled={saving}
              className={`nyro-panel p-3 text-sm text-left transition-colors ${
                settings.theme === t.id ? "border-nexus-accent" : "hover:border-nexus-muted"
              }`}
            >
              <div
                style={{ background: t.preview }}
                className="w-full h-10 rounded-md mb-2 border border-nexus-border"
              />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <p className="nyro-section-title">Couleur d'accent</p>
        <div className="flex items-center gap-2 flex-wrap">
          {ACCENT_PRESETS.map((c) => (
            <button
              key={c}
              onClick={() => save({ accent_color: c })}
              style={{ backgroundColor: c }}
              className={`w-8 h-8 rounded-md border-2 ${
                settings.accent_color === c ? "border-nexus-text" : "border-transparent"
              }`}
              title={c}
            />
          ))}
          <input
            type="color"
            value={settings.accent_color ?? "#6c5ce7"}
            onChange={(e) => save({ accent_color: e.target.value })}
            className="w-8 h-8 rounded-md border border-nexus-border bg-transparent cursor-pointer"
            title="Couleur personnalisée"
          />
          {settings.accent_color && (
            <button
              onClick={() => save({ accent_color: null })}
              className="text-xs text-nexus-muted hover:text-nexus-text ml-1"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <p className="nyro-section-title">Accessibilité</p>
        <div className="space-y-3">
          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={settings.reduce_animations}
              onChange={(e) => save({ reduce_animations: e.target.checked })}
              className="accent-nexus-accent"
            />
            Réduire les animations
          </label>
          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={settings.developer_mode}
              onChange={(e) => save({ developer_mode: e.target.checked })}
              className="accent-nexus-accent"
            />
            Activer le mode développeur
          </label>
        </div>
      </div>

      <div className="space-y-3">
        <p className="nyro-section-title">Covers en ligne — clé API SteamGridDB</p>
        <p className="text-xs text-nexus-muted">
          Gratuit, inscription en 30 secondes sur{" "}
          <a
            href="https://www.steamgriddb.com/profile/preferences/api"
            target="_blank"
            rel="noreferrer"
            className="text-nexus-accent hover:text-nexus-text transition-colors"
          >
            steamgriddb.com/profile/preferences/api
          </a>
          . Chaque utilisateur met sa propre clé (quota). Sans clé, Nyro affiche juste l'initiale du jeu, sans planter.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="Colle ta clé API ici"
            className="nyro-input flex-1 px-3 py-2 text-sm font-mono"
          />
          <button
            onClick={() => save({ steamgriddb_api_key: apiKeyInput.trim() || null })}
            disabled={saving}
            className="nyro-btn px-4 py-2 text-sm"
          >
            Enregistrer
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <p className="nyro-section-title">Succès Steam — API officielle Valve</p>
        <p className="text-xs text-nexus-muted">
          Clé gratuite instantanée sur{" "}
          <a
            href="https://steamcommunity.com/dev/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-nexus-accent hover:text-nexus-text transition-colors"
          >
            steamcommunity.com/dev/apikey
          </a>
          . Ton SteamID64 se trouve sur{" "}
          <a
            href="https://steamid.io"
            target="_blank"
            rel="noreferrer"
            className="text-nexus-accent hover:text-nexus-text transition-colors"
          >
            steamid.io
          </a>{" "}
          en collant l'URL de ton profil. Ton profil Steam doit avoir ses succès en visibilité publique.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={steamApiKeyInput}
            onChange={(e) => setSteamApiKeyInput(e.target.value)}
            placeholder="Clé API Steam"
            className="nyro-input flex-1 px-3 py-2 text-sm font-mono"
          />
          <input
            value={steamIdInput}
            onChange={(e) => setSteamIdInput(e.target.value)}
            placeholder="SteamID64 (ex: 76561198...)"
            className="nyro-input flex-1 px-3 py-2 text-sm font-mono"
          />
          <button
            onClick={() =>
              save({
                steam_api_key: steamApiKeyInput.trim() || null,
                steam_id64: steamIdInput.trim() || null,
              })
            }
            disabled={saving}
            className="nyro-btn px-4 py-2 text-sm"
          >
            Enregistrer
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <p className="nyro-section-title">Trailers — IGDB (Twitch)</p>
        <p className="text-xs text-nexus-muted">
          Meilleure source pour les jeux hors Steam, rétro et émulateurs. Crée une app sur{" "}
          <a
            href="https://dev.twitch.tv/console"
            target="_blank"
            rel="noreferrer"
            className="text-nexus-accent hover:text-nexus-text transition-colors"
          >
            dev.twitch.tv/console
          </a>{" "}
          puis colle Client ID + Client Secret. Si ces champs sont vides, Nyro passe à YouTube ou à l'image de fond.
        </p>
        <div className="flex gap-2 flex-wrap">
          <input
            value={igdbClientIdInput}
            onChange={(e) => setIgdbClientIdInput(e.target.value)}
            placeholder="IGDB / Twitch Client ID"
            className="nyro-input flex-1 min-w-[160px] px-3 py-2 text-sm font-mono"
          />
          <input
            type="password"
            value={igdbClientSecretInput}
            onChange={(e) => setIgdbClientSecretInput(e.target.value)}
            placeholder="Client Secret"
            className="nyro-input flex-1 min-w-[160px] px-3 py-2 text-sm font-mono"
          />
          <button
            onClick={() =>
              save({
                igdb_client_id: igdbClientIdInput.trim() || null,
                igdb_client_secret: igdbClientSecretInput.trim() || null,
              })
            }
            disabled={saving}
            className="nyro-btn px-4 py-2 text-sm"
          >
            Enregistrer
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <p className="nyro-section-title">Trailers — YouTube</p>
        <p className="text-xs text-nexus-muted">
          Repli si Steam et IGDB n'ont pas de trailer. Clé gratuite sur{" "}
          <a
            href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
            target="_blank"
            rel="noreferrer"
            className="text-nexus-accent hover:text-nexus-text transition-colors"
          >
            console.cloud.google.com
          </a>{" "}
          (active "YouTube Data API v3" puis crée une clé). Les trailers YouTube s'affichent en lecteur
          intégré muet, sans possibilité de réactiver le son pour l'instant (limitation du lecteur
          YouTube embarqué).
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={youtubeApiKeyInput}
            onChange={(e) => setYoutubeApiKeyInput(e.target.value)}
            placeholder="Clé API YouTube"
            className="nyro-input flex-1 px-3 py-2 text-sm font-mono"
          />
          <button
            onClick={() => save({ youtube_api_key: youtubeApiKeyInput.trim() || null })}
            disabled={saving}
            className="nyro-btn px-4 py-2 text-sm"
          >
            Enregistrer
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <p className="nyro-section-title">Démarrage & fenêtre</p>
        <label className="flex items-center gap-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={autostart}
            onChange={(e) => toggleAutostart(e.target.checked)}
            className="accent-nexus-accent"
          />
          Lancer Nyro au démarrage de Windows
        </label>
        <button
          onClick={openMiniMode}
          className="nyro-btn text-xs px-3 py-2"
        >
          Ouvrir le mode minimal
        </button>
        <p className="text-xs text-nexus-muted">
          Fermer la fenêtre principale réduit Nyro dans la zone de notification Windows au lieu de le
          quitter. Utilise "Quitter" depuis l'icône du tray pour fermer complètement.
        </p>
      </div>

      <div className="space-y-3">
        <p className="nyro-section-title">Intégration Windows</p>
        <label className="flex items-center gap-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={contextMenuInstalled}
            onChange={(e) => toggleContextMenu(e.target.checked)}
            className="accent-nexus-accent"
          />
          Menu clic-droit Windows ("Ajouter à Nyro" sur les .exe, "Ouvrir avec Nyro" sur les dossiers)
        </label>
        <p className="text-xs text-nexus-muted">
          Installé uniquement pour ton compte utilisateur, aucun droit administrateur requis. Tu peux le
          retirer à tout moment en décochant.
        </p>
      </div>

      <div className="space-y-3">
        <p className="nyro-section-title">Sauvegarde & restauration</p>
        <p className="text-xs text-nexus-muted">
          Exporte toute ta bibliothèque (jeux, mods, favoris, paramètres) dans un fichier que tu peux
          garder en sécurité ou transférer sur un autre PC.
        </p>
        <div className="flex gap-2">
          <button
            onClick={exportConfig}
            className="nyro-btn text-xs px-3 py-2"
          >
            Exporter ma configuration
          </button>
          <button
            onClick={importConfig}
            className="nyro-btn text-xs px-3 py-2 hover:border-nexus-danger"
          >
            Importer une configuration
          </button>
        </div>
      </div>

      <div className="nyro-panel p-4 text-sm text-nexus-muted">
        Configuration stockée dans : <code>%APPDATA%\Nyro\config.json</code>
      </div>
    </div>
  );
}
