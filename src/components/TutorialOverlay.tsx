import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import SidebarIcon from "./SidebarIcon";
import lapinTuto from "../../assets/lapin_tuto.png";

interface TutorialOverlayProps {
  open: boolean;
  currentView: string;
  onClose: () => void;
  onNavigate: (view: "home" | "games") => void;
}

type TutorialStep = {
  id: string;
  title: string;
  text: string;
  targetId: string;
  view: "home" | "games";
};

const STEPS: TutorialStep[] = [
  {
    id: "step-1",
    title: "Étape 1",
    text: "Clique sur ce lapin quand tu veux relancer le tutoriel de Nyro.",
    targetId: "tutorial-open-rabbit",
    view: "home",
  },
  {
    id: "step-2",
    title: "Étape 2",
    text: "Ajoute un jeu ici pour commencer à remplir ta bibliothèque.",
    targetId: "tutorial-add-game",
    view: "games",
  },
  {
    id: "step-3",
    title: "Étape 3",
    text: "Tu peux aussi lancer une détection automatique de tes jeux.",
    targetId: "tutorial-detect-games",
    view: "games",
  },
  {
    id: "step-4",
    title: "Étape 4",
    text: "Retrouve ici tes jeux récemment ajoutés pour y accéder vite.",
    targetId: "tutorial-recent-games",
    view: "home",
  },
  {
    id: "step-5",
    title: "Étape 5",
    text: "Ce bouton ouvre le classement des jeux les plus joués.",
    targetId: "tutorial-sidebar-ranking",
    view: "home",
  },
];

export default function TutorialOverlay({ open, currentView, onClose, onNavigate }: TutorialOverlayProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [anchoredStepId, setAnchoredStepId] = useState<string | null>(null);

  const step = STEPS[stepIndex];
  const anchored = anchoredStepId === step.id && rect !== null;

  useEffect(() => {
    if (!open) return;
    if (currentView !== step.view) {
      onNavigate(step.view);
    }
  }, [open, step, currentView, onNavigate]);

  useLayoutEffect(() => {
    if (!open) return;
    if (currentView !== step.view) {
      setAnchoredStepId(null);
      return;
    }

    let cancelled = false;
    let frame = 0;
    let attempts = 0;

    function updateRect() {
      const target = document.querySelector(`[data-tutorial-id="${step.targetId}"]`);
      if (target instanceof HTMLElement) {
        setRect(target.getBoundingClientRect());
        setAnchoredStepId(step.id);
        return true;
      }
      return false;
    }

    function retryLocate() {
      if (cancelled) return;
      const found = updateRect();
      attempts += 1;
      if (!found && attempts < 60) {
        frame = window.requestAnimationFrame(retryLocate);
      }
    }

    if (!updateRect()) {
      frame = window.requestAnimationFrame(retryLocate);
    }

    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [open, step, currentView]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.code === "Space") {
        event.preventDefault();
        if (stepIndex >= STEPS.length - 1) {
          onClose();
          setStepIndex(0);
        } else {
          setStepIndex((i) => i + 1);
        }
      }
      if (event.code === "Escape") {
        event.preventDefault();
        onClose();
        setStepIndex(0);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, stepIndex]);

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      setRect(null);
      setAnchoredStepId(null);
    }
  }, [open]);

  const bubbleStyle = useMemo(() => {
    if (!rect) return undefined;

    const bubbleWidth = Math.min(340, window.innerWidth - 48);
    const preferBelow = rect.bottom + 170 < window.innerHeight;
    const top = preferBelow ? rect.bottom + 18 : Math.max(24, rect.top - 170);

    let left = rect.left;
    if (left + bubbleWidth > window.innerWidth - 24) {
      left = window.innerWidth - bubbleWidth - 24;
    }
    left = Math.max(24, left);

    return { top, left };
  }, [rect]);

  if (!open) return null;

  return (
    <div className="tutorial-overlay">
      <div className="tutorial-backdrop" />
      {anchored && rect && (
        <div
          className="tutorial-highlight"
          style={{
            top: rect.top - 8,
            left: rect.left - 8,
            width: rect.width + 16,
            height: rect.height + 16,
          }}
        />
      )}

      {anchored && rect && (
        <div className="tutorial-bubble nyro-panel" style={bubbleStyle}>
          <div className="flex items-start gap-3">
            <SidebarIcon src={lapinTuto} alt="Tutoriel" removeGreenScreen className="w-12 h-12 object-contain shrink-0" />
            <div className="space-y-2">
              <div>
                <p className="nyro-section-title mb-1">{step.title}</p>
                <p className="text-sm leading-6">{step.text}</p>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-nexus-muted">
                <span>
                  {stepIndex + 1} / {STEPS.length}
                </span>
                <span>Espace : étape suivante · Échap : fermer</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
