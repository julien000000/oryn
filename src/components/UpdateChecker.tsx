import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Settings } from "../types";
import { notify } from "../notify";

interface UpdateCheckerProps {
  settings: Settings;
  triggerCheck?: number;
  onSettingsChanged?: () => void;
}

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

export default function UpdateChecker({ settings, triggerCheck, onSettingsChanged }: UpdateCheckerProps) {
  const [update, setUpdate] = useState<Update | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const announcedVersion = useRef<string | null>(null);

  async function runCheck() {
    setError(null);
    try {
      const result = await check();
      if (result?.available && result.version !== settings.ignored_update_version) {
        setUpdate(result);
        if (announcedVersion.current !== result.version) {
          announcedVersion.current = result.version;
          notify(`Mise à jour ${result.version} disponible`, "info");
        }
      } else {
        setUpdate(null);
      }
    } catch (e) {
      console.warn("Vérification de mise à jour échouée :", e);
    }
  }

  useEffect(() => {
    runCheck();
    const timer = window.setInterval(runCheck, CHECK_EVERY_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (triggerCheck !== undefined) {
      runCheck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerCheck]);

  async function handleUpdate() {
    if (!update) return;
    setDownloading(true);
    setError(null);
    try {
      let downloaded = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total > 0) setProgress(Math.round((downloaded / total) * 100));
        }
      });
      await relaunch();
    } catch (e) {
      setError(String(e));
      setDownloading(false);
    }
  }

  async function handleIgnore() {
    if (!update) return;
    try {
      await invoke("update_settings", { settings: { ...settings, ignored_update_version: update.version } });
      onSettingsChanged?.();
    } catch {
      // on ferme quand même
    }
    setUpdate(null);
  }

  if (!update) return null;

  return (
    <div className="update-banner shrink-0 z-[110]">
      <div className="flex items-center justify-between gap-3 px-4 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            Mise à jour disponible — version {update.version}
            <span className="text-nexus-muted font-normal"> (tu as la {update.currentVersion})</span>
          </p>
          {error && <p className="text-xs text-nexus-danger truncate">{error}</p>}
        </div>

        {downloading ? (
          <div className="flex items-center gap-3 min-w-[180px]">
            <div className="w-28 h-1.5 bg-nexus-panel2 rounded-full overflow-hidden">
              <div
                className="h-full bg-nexus-accent rounded-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-nexus-muted whitespace-nowrap">
              {progress > 0 ? `${progress}%` : "Téléchargement..."}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={handleIgnore} className="px-2 py-1 rounded-lg text-xs text-nexus-muted hover:text-nexus-text">
              Ignorer
            </button>
            <button
              onClick={() => setUpdate(null)}
              className="px-2 py-1 rounded-lg text-xs text-nexus-muted hover:text-nexus-text"
            >
              Plus tard
            </button>
            <button
              onClick={handleUpdate}
              className="nyro-btn-strong px-3 py-1.5 text-xs font-medium"
            >
              Mettre à jour
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
