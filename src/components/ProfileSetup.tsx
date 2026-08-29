import { ChangeEvent, FormEvent, useState } from "react";

interface ProfileSetupProps {
  onComplete: (profile: { name: string; avatar: string | null }) => void;
}

const AVATARS = ["🎮", "🐰", "🦊", "🐺", "👾", "🚀", "⚡", "🎧"];

export default function ProfileSetup({ onComplete }: ProfileSetupProps) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | null>("🎮");
  const [error, setError] = useState("");

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choisis une image (PNG, JPG, WEBP...).");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("L'image doit faire moins de 2 Mo.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatar(String(reader.result));
    reader.readAsDataURL(file);
    setError("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const clean = name.trim();
    if (clean.length < 2) {
      setError("Entre un pseudo d'au moins 2 caractères.");
      return;
    }
    onComplete({ name: clean, avatar });
  }

  const isImage = avatar?.startsWith("data:image/");

  return (
    <div className="profile-setup">
      <div className="profile-setup-glow" />
      <form className="profile-setup-card" onSubmit={submit}>
        <div className="profile-setup-brand">ORYN</div>
        <div className="profile-setup-step">PREMIER LANCEMENT · 01</div>
        <h1>Bienvenue.</h1>
        <p className="profile-setup-lead">Créons ton profil de joueur avant de commencer.</p>

        <label className="profile-label" htmlFor="oryn-profile-name">Ton pseudo</label>
        <input
          id="oryn-profile-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="profile-name-input"
          placeholder="Entre ton pseudo..."
          maxLength={24}
        />

        <div className="profile-label profile-avatar-label">Ton avatar</div>
        <div className="profile-avatar-preview">
          {isImage ? <img src={avatar!} alt="Avatar" /> : <span>{avatar}</span>}
        </div>
        <div className="profile-avatar-grid">
          {AVATARS.map((item) => (
            <button
              type="button"
              key={item}
              className={`profile-avatar-option ${avatar === item ? "selected" : ""}`}
              onClick={() => setAvatar(item)}
            >
              {item}
            </button>
          ))}
          <label className={`profile-avatar-option upload ${isImage ? "selected" : ""}`} title="Importer une image">
            ＋
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleUpload} />
          </label>
        </div>

        {error && <div className="profile-setup-error">{error}</div>}

        <button className="profile-setup-submit" type="submit">
          Continuer <span>→</span>
        </button>
        <div className="profile-setup-footer">Tu pourras modifier ton profil dans Paramètres.</div>
      </form>
    </div>
  );
}
