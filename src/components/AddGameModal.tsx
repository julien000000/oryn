import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { notify } from "../notify";

interface AddGameModalProps {
  onClose: () => void;
  onAdded: () => void;
  initialExePath?: string;
}

export default function AddGameModal({ onClose, onAdded, initialExePath }: AddGameModalProps) {
  const [name, setName] = useState(
    initialExePath ? (initialExePath.split("\\").pop()?.replace(/\.exe$/i, "") ?? "") : ""
  );
  const [executablePath, setExecutablePath] = useState(initialExePath ?? "");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [coverPath, setCoverPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function pickExecutable() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Exécutable", extensions: ["exe"] }],
    });
    if (typeof selected === "string") {
      setExecutablePath(selected);
      if (!name) {
        const fileName = selected.split("\\").pop()?.replace(/\.exe$/i, "") ?? "";
        setName(fileName);
      }
    }
  }

  async function pickCover() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }],
    });
    if (typeof selected === "string") {
      setCoverPath(selected);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!name.trim() || !executablePath.trim()) {
      setError("Le nom et l'exécutable sont obligatoires.");
      return;
    }
    setLoading(true);
    try {
      await invoke("add_game", {
        name: name.trim(),
        executablePath,
        category: category.trim(),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        coverPath: coverPath || null,
      });
      notify(`"${name.trim()}" ajouté`, "success");
      onAdded();
    } catch (e) {
      notify(`Erreur : ${e}`, "error");
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-nexus-panel border border-nexus-border rounded-xl2 p-6 w-full max-w-md space-y-4">
        <h2 className="text-lg font-semibold">Ajouter un jeu</h2>

        <div className="space-y-1">
          <label className="text-xs text-nexus-muted">Exécutable</label>
          <div className="flex gap-2">
            <input
              readOnly
              value={executablePath}
              placeholder="Aucun fichier sélectionné"
              className="flex-1 bg-nexus-panel2 border border-nexus-border rounded-lg px-3 py-2 text-sm text-nexus-muted"
            />
            <button
              onClick={pickExecutable}
              className="bg-nexus-panel2 border border-nexus-border rounded-lg px-3 py-2 text-sm hover:border-nexus-accent"
            >
              Parcourir
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-nexus-muted">Nom</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-nexus-panel2 border border-nexus-border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-nexus-muted">Catégorie</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Horror, RPG, Action..."
            className="w-full bg-nexus-panel2 border border-nexus-border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-nexus-muted">Cover (optionnel)</label>
          <div className="flex gap-2 items-center">
            {coverPath ? (
              <span className="flex-1 truncate text-xs text-nexus-muted" title={coverPath}>
                {coverPath.split("\\").pop()}
              </span>
            ) : (
              <span className="flex-1 text-xs text-nexus-muted">Aucune image sélectionnée</span>
            )}
            <button
              onClick={pickCover}
              className="bg-nexus-panel2 border border-nexus-border rounded-lg px-3 py-2 text-sm hover:border-nexus-accent"
            >
              Choisir une image
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-nexus-muted">Tags (séparés par des virgules)</label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Horror, Mods, Coop"
            className="w-full bg-nexus-panel2 border border-nexus-border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="text-xs text-nexus-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-nexus-muted hover:text-nexus-text">
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-nexus-accent hover:opacity-90 transition-opacity px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Ajout..." : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}
