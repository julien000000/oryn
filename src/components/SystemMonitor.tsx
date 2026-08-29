import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SystemStats } from "../types";

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} Go`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} Mo`;
}

function Bar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="w-full h-2 bg-nexus-panel2 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%`, backgroundColor: color }}
      />
    </div>
  );
}

export default function SystemMonitor() {
  const [stats, setStats] = useState<SystemStats | null>(null);

  useEffect(() => {
    let mounted = true;
    async function poll() {
      try {
        const s = await invoke<SystemStats>("get_system_stats");
        if (mounted) setStats(s);
      } catch {
        // silencieux : on retente au prochain cycle
      }
    }
    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (!stats) {
    return (
      <div className="page-enter p-8">
        <p className="text-sm text-nexus-muted">Lecture des informations système...</p>
      </div>
    );
  }

  const ramPercent = stats.ram_total_bytes > 0 ? (stats.ram_used_bytes / stats.ram_total_bytes) * 100 : 0;

  return (
    <div className="page-enter p-8 space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold">Ton PC</h1>

      <div className="bg-nexus-panel border border-nexus-border rounded-xl2 p-5 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-nexus-muted">CPU {stats.cpu_brand ? `— ${stats.cpu_brand}` : ""}</span>
          <span>{stats.cpu_usage_percent.toFixed(0)}%</span>
        </div>
        <Bar percent={stats.cpu_usage_percent} color="#6c5ce7" />
        <p className="text-xs text-nexus-muted">{stats.cpu_cores} cœurs logiques</p>
      </div>

      <div className="bg-nexus-panel border border-nexus-border rounded-xl2 p-5 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-nexus-muted">RAM</span>
          <span>
            {formatBytes(stats.ram_used_bytes)} / {formatBytes(stats.ram_total_bytes)}
          </span>
        </div>
        <Bar percent={ramPercent} color="#00d2ff" />
      </div>

      <div className="space-y-3">
        <p className="text-xs text-nexus-muted">STOCKAGE</p>
        {stats.disks.map((d) => {
          const used = d.total_bytes - d.available_bytes;
          const percent = d.total_bytes > 0 ? (used / d.total_bytes) * 100 : 0;
          return (
            <div key={d.mount_point} className="bg-nexus-panel border border-nexus-border rounded-xl2 p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>{d.mount_point}</span>
                <span className="text-nexus-muted">
                  {formatBytes(used)} / {formatBytes(d.total_bytes)}
                </span>
              </div>
              <Bar percent={percent} color={percent > 90 ? "#ff5c5c" : "#3ddc97"} />
            </div>
          );
        })}
        {stats.disks.length === 0 && <p className="text-sm text-nexus-muted">Aucun disque détecté.</p>}
      </div>

      {stats.gpu.available ? (
        <div className="bg-nexus-panel border border-nexus-border rounded-xl2 p-5 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-nexus-muted">GPU — {stats.gpu.name}</span>
            <span>
              {stats.gpu.usage_percent.toFixed(0)}%
              {stats.gpu.temperature_celsius !== null ? ` · ${stats.gpu.temperature_celsius}°C` : ""}
            </span>
          </div>
          <Bar percent={stats.gpu.usage_percent} color="#3ddc97" />
          <div className="flex items-center justify-between text-xs text-nexus-muted">
            <span>VRAM</span>
            <span>
              {formatBytes(stats.gpu.memory_used_bytes)} / {formatBytes(stats.gpu.memory_total_bytes)}
            </span>
          </div>
          <Bar
            percent={
              stats.gpu.memory_total_bytes > 0
                ? (stats.gpu.memory_used_bytes / stats.gpu.memory_total_bytes) * 100
                : 0
            }
            color="#00d2ff"
          />
        </div>
      ) : (
        <p className="text-xs text-nexus-muted">
          GPU non disponible : aucune carte NVIDIA détectée par NVML (les GPU AMD/Intel ne sont pas
          encore supportés).
        </p>
      )}
    </div>
  );
}
