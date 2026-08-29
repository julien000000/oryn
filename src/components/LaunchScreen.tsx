import { useEffect, useState } from "react";
import { randomTip } from "../tips";

interface LaunchScreenProps {
  gameName: string;
  trailerUrl: string | null;
  backgroundUrl: string | null;
  coverImage: string | null;
  logoImage: string | null;
  status: "loading" | "error";
  errorMessage?: string;
  onClose: () => void;
}

export default function LaunchScreen({
  gameName,
  trailerUrl,
  backgroundUrl,
  coverImage,
  logoImage,
  status,
  errorMessage,
  onClose,
}: LaunchScreenProps) {
  const [tip, setTip] = useState(() => randomTip());

  useEffect(() => {
    const interval = setInterval(() => {
      setTip((prev) => randomTip(prev.index));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const mediaUrl = trailerUrl ?? backgroundUrl ?? coverImage;

  return (
    <div className="fixed inset-0 z-[300] bg-nexus-bg overflow-hidden">
      {trailerUrl ? (
        <video
          autoPlay
          muted
          loop
          playsInline
          src={trailerUrl}
          className="absolute inset-0 w-full h-full object-cover hero-zoom"
        />
      ) : mediaUrl ? (
        <div
          style={{ backgroundImage: `url(${mediaUrl})`, backgroundSize: "cover", backgroundPosition: "center" }}
          className="absolute inset-0 w-full h-full hero-zoom"
        />
      ) : (
        <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-nexus-accent/40 to-nexus-accent2/20" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-nexus-bg via-nexus-bg/70 to-nexus-bg/40" />

      <div className="relative z-10 h-full flex flex-col items-center justify-center gap-6 px-8 text-center">
        {logoImage ? (
          <img src={logoImage} alt={gameName} className="max-h-28 max-w-md object-contain drop-shadow-2xl" />
        ) : (
          <h1 className="text-4xl font-extrabold tracking-tight drop-shadow-2xl">{gameName}</h1>
        )}

        {status === "loading" ? (
          <>
            <p className="text-sm text-nexus-muted">Lancement de {gameName}...</p>
            <div className="w-64 h-1.5 bg-nexus-panel2 rounded-full overflow-hidden">
              <div className="h-full w-1/3 bg-nexus-accent rounded-full launch-indeterminate" />
            </div>
            <div className="max-w-md bg-nexus-panel/80 border border-nexus-border rounded-xl2 px-4 py-3 mt-4">
              <p className="text-xs text-nexus-accent2 mb-1">💡 Astuce</p>
              <p className="text-xs text-nexus-muted">{tip.tip}</p>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-nexus-danger max-w-md">{errorMessage ?? "Le lancement a échoué."}</p>
            <button
              onClick={onClose}
              className="bg-nexus-accent hover:opacity-90 transition-opacity px-5 py-2 rounded-xl2 text-sm font-medium"
            >
              Retour à la page du jeu
            </button>
          </>
        )}
      </div>
    </div>
  );
}
