export interface ModEntry {
  id: string;
  name: string;
  storage_path: string;
  enabled: boolean;
}

export interface GameProfile {
  id: string;
  name: string;
  launch_args: string;
  executable_override: string | null;
  active_mod_ids: string[];
}

export interface GameMedia {
  trailer_url: string | null;
  trailer_youtube_id: string | null;
  background_url: string | null;
  description: string | null;
  genres: string[];
  developers: string[];
  publishers: string[];
  release_date: string | null;
}

export interface Game {
  id: string;
  name: string;
  executable_path: string;
  folder_path: string;
  category: string;
  tags: string[];
  launch_args: string;
  last_played: string | null;
  cover_image: string | null;
  logo_image: string | null;
  source: string;
  steam_app_id: string | null;
  profiles: GameProfile[];
  active_profile_id: string | null;
  mods: ModEntry[];
  mods_folder: string | null;
  total_playtime_seconds: number;
}

export interface DetectedGame {
  name: string;
  executable_path: string;
  folder_path: string;
  source: string;
  steam_app_id: string | null;
}

export interface Favorite {
  id: string;
  name: string;
  path: string;
}

export interface OnlineGameMatch {
  id: number;
  name: string;
  verified: boolean;
}

export interface OnlineCoverOption {
  id: number;
  url: string;
  thumb: string;
}

export interface Settings {
  theme: string;
  accent_color: string | null;
  reduce_animations: boolean;
  developer_mode: boolean;
  steamgriddb_api_key: string | null;
  steam_api_key: string | null;
  steam_id64: string | null;
  youtube_api_key: string | null;
  igdb_client_id: string | null;
  igdb_client_secret: string | null;
  ignored_update_version: string | null;
}

export interface SteamAchievement {
  api_name: string;
  name: string;
  description: string;
  achieved: boolean;
  icon: string;
}

export interface AppConfig {
  games: Game[];
  favorites: Favorite[];
  settings: Settings;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: string | null;
  extension: string | null;
}

export interface SearchResult {
  kind: "game" | "favorite" | "folder" | "file";
  label: string;
  subtitle: string;
  path: string | null;
  game_id: string | null;
}

export interface DiskStat {
  name: string;
  mount_point: string;
  total_bytes: number;
  available_bytes: number;
}

export interface GpuStats {
  available: boolean;
  name: string;
  usage_percent: number;
  memory_used_bytes: number;
  memory_total_bytes: number;
  temperature_celsius: number | null;
}

export interface SystemStats {
  cpu_usage_percent: number;
  cpu_brand: string;
  cpu_cores: number;
  ram_used_bytes: number;
  ram_total_bytes: number;
  disks: DiskStat[];
  gpu: GpuStats;
}

export type View = "home" | "games" | "ranking" | "game-detail" | "files" | "pc" | "settings";
