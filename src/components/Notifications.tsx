import { useEffect, useState } from "react";
import { NotifyType } from "../notify";

interface Toast {
  id: number;
  message: string;
  type: NotifyType;
}

const ICON: Record<NotifyType, string> = {
  info: "ℹ️",
  success: "✅",
  error: "⚠️",
};

const BORDER: Record<NotifyType, string> = {
  info: "border-nexus-border",
  success: "border-nexus-success/50",
  error: "border-nexus-danger/50",
};

let nextId = 1;

export default function Notifications() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    function handle(e: Event) {
      const detail = (e as CustomEvent).detail as { message: string; type: NotifyType };
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message: detail.message, type: detail.type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3500);
    }
    window.addEventListener("nexus-notify", handle);
    return () => window.removeEventListener("nexus-notify", handle);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-xs">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast-enter bg-nexus-panel border ${BORDER[t.type]} rounded-xl2 px-3 py-2 text-sm shadow-lg flex items-center gap-2`}
        >
          <span>{ICON[t.type]}</span>
          <span className="flex-1">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
