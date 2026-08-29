import { useEffect, useMemo, useState } from "react";

interface SidebarIconProps {
  src: string;
  alt?: string;
  removeGreenScreen?: boolean;
  className?: string;
}

function normalizeHex(hex: string): [number, number, number] {
  const value = hex.replace("#", "").trim();
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return [r, g, b];
}

function createTransparentVersion(src: string, greenHex: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas non disponible"));
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const [targetR, targetG, targetB] = normalizeHex(greenHex);
      const threshold = 28;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const dr = Math.abs(r - targetR);
        const dg = Math.abs(g - targetG);
        const db = Math.abs(b - targetB);

        if (dr <= threshold && dg <= threshold && db <= threshold) {
          data[i + 3] = 0;
        }
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Impossible de charger l'image"));
    img.src = src;
  });
}

export default function SidebarIcon({ src, alt = "", removeGreenScreen = false, className = "" }: SidebarIconProps) {
  const [processedSrc, setProcessedSrc] = useState<string>(src);
  const cacheKey = useMemo(() => `${src}|${removeGreenScreen ? "green" : "raw"}`, [src, removeGreenScreen]);

  useEffect(() => {
    let cancelled = false;

    if (!removeGreenScreen) {
      setProcessedSrc(src);
      return;
    }

    createTransparentVersion(src, "#42ff00")
      .then((result) => {
        if (!cancelled) setProcessedSrc(result);
      })
      .catch(() => {
        if (!cancelled) setProcessedSrc(src);
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, removeGreenScreen, src]);

  return <img src={processedSrc} alt={alt} className={className} />;
}
