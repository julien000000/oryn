// Nyro - backend Rust/Tauri
// Ne montre pas de console sur Windows en mode release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod archives;
mod config;
mod context_menu;
mod detect;
mod files;
mod games;
mod metadata;
mod mods;
mod search;
mod system;

use chrono::Utc;
use config::{AppConfig, Favorite};
use games::Game;
use serde::Serialize;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "path")]
enum PendingAction {
    AddGame(String),
    OpenFolder(String),
}

/// Reconnaît --add-game <chemin> ou --open-folder <chemin> passés en argument,
/// que ce soit au premier lancement de Nyro ou via le menu contextuel Windows
/// pendant que Nyro tourne déjà (routé par le plugin single-instance).
fn parse_launch_args(args: &[String]) -> Option<PendingAction> {
    let mut iter = args.iter();
    while let Some(a) = iter.next() {
        if a == "--add-game" {
            if let Some(p) = iter.next() {
                return Some(PendingAction::AddGame(p.clone()));
            }
        }
        if a == "--open-folder" {
            if let Some(p) = iter.next() {
                return Some(PendingAction::OpenFolder(p.clone()));
            }
        }
    }
    None
}

/// Ajoute une session de jeu au temps de jeu total et sauvegarde. Appelée
/// depuis les threads d'arrière-plan de suivi de session dans games.rs.
fn persist_playtime(app: &tauri::AppHandle, game_id: &str, elapsed_seconds: u64) {
    let state = app.state::<AppState>();
    if let Ok(mut cfg) = state.config.lock() {
        if let Some(game) = cfg.games.iter_mut().find(|g| g.id == game_id) {
            game.total_playtime_seconds += elapsed_seconds;
        }
        let _ = config::save_config(&cfg);
    }
    let _ = app.emit("playtime-updated", ());
}

struct AppState {
    config: Mutex<AppConfig>,
    pending_action: Mutex<Option<PendingAction>>,
}

use nvml_wrapper::Nvml;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};

struct SystemState {
    sys: Mutex<sysinfo::System>,
    nvml: Option<Nvml>,
}

#[tauri::command]
fn update_settings(state: State<AppState>, settings: config::Settings) -> Result<AppConfig, String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.settings = settings;
    config::save_config(&cfg)?;
    Ok(cfg.clone())
}

// ---------- MONITORING PC ----------

#[tauri::command]
fn get_system_stats(state: State<SystemState>) -> system::SystemStats {
    let mut sys = state.sys.lock().unwrap();
    let mut stats = system::get_stats(&mut sys);
    stats.gpu = system::get_gpu_stats(state.nvml.as_ref());
    stats
}

// ---------- COMMANDS EXPOSÉES AU FRONTEND ----------

#[tauri::command]
fn get_config(state: State<AppState>) -> AppConfig {
    state.config.lock().unwrap().clone()
}

#[tauri::command]
fn add_game(
    state: State<AppState>,
    name: String,
    executable_path: String,
    category: String,
    tags: Vec<String>,
    cover_path: Option<String>,
) -> Result<AppConfig, String> {
    if !games::verify_executable(&executable_path) {
        return Err("L'exécutable spécifié est introuvable.".to_string());
    }

    let cover_image = match cover_path {
        Some(p) if !p.trim().is_empty() => Some(games::encode_cover(&p)?),
        _ => None,
    };

    let folder_path = std::path::Path::new(&executable_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let new_game = Game {
        id: Uuid::new_v4().to_string(),
        name,
        executable_path,
        folder_path,
        category,
        tags,
        launch_args: String::new(),
        last_played: None,
        cover_image,
        logo_image: None,
        source: "manual".to_string(),
        steam_app_id: None,
        profiles: vec![],
        active_profile_id: None,
        mods: vec![],
        mods_folder: None,
        total_playtime_seconds: 0,
    };

    let mut cfg = state.config.lock().unwrap();
    cfg.games.push(new_game);
    config::save_config(&cfg)?;
    Ok(cfg.clone())
}

#[tauri::command]
fn set_game_cover(state: State<AppState>, id: String, image_path: String) -> Result<AppConfig, String> {
    let cover_image = games::encode_cover(&image_path)?;
    let mut cfg = state.config.lock().unwrap();
    let game = cfg
        .games
        .iter_mut()
        .find(|g| g.id == id)
        .ok_or("Jeu introuvable.")?;
    game.cover_image = Some(cover_image);
    config::save_config(&cfg)?;
    Ok(cfg.clone())
}

#[tauri::command]
fn remove_game(state: State<AppState>, id: String) -> Result<AppConfig, String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.games.retain(|g| g.id != id);
    config::save_config(&cfg)?;
    Ok(cfg.clone())
}

#[tauri::command]
fn update_game(state: State<AppState>, game: Game) -> Result<AppConfig, String> {
    let mut cfg = state.config.lock().unwrap();
    if let Some(existing) = cfg.games.iter_mut().find(|g| g.id == game.id) {
        *existing = game;
    }
    config::save_config(&cfg)?;
    Ok(cfg.clone())
}

#[tauri::command]
fn launch_game(app: tauri::AppHandle, state: State<AppState>, id: String) -> Result<(), String> {
    let (source, steam_app_id, folder_path, executable, args) = {
        let cfg = state.config.lock().unwrap();
        let game = cfg.games.iter().find(|g| g.id == id).ok_or("Jeu introuvable.")?;
        let (executable, args) = match game
            .active_profile_id
            .as_ref()
            .and_then(|pid| game.profiles.iter().find(|p| &p.id == pid))
        {
            Some(profile) => (
                profile
                    .executable_override
                    .clone()
                    .unwrap_or_else(|| game.executable_path.clone()),
                profile.launch_args.clone(),
            ),
            None => (game.executable_path.clone(), game.launch_args.clone()),
        };
        (
            game.source.clone(),
            game.steam_app_id.clone(),
            game.folder_path.clone(),
            executable,
            args,
        )
    };

    if source == "steam" {
        let app_id = steam_app_id.ok_or("Identifiant Steam manquant pour ce jeu.")?;
        games::launch_steam(&app_id)?;
        games::track_steam_playtime(app.clone(), id.clone(), folder_path);
    } else {
        games::launch_and_track(app.clone(), id.clone(), executable, args, folder_path)?;
    }

    let mut cfg = state.config.lock().unwrap();
    if let Some(game) = cfg.games.iter_mut().find(|g| g.id == id) {
        game.last_played = Some(Utc::now().to_rfc3339());
    }
    config::save_config(&cfg)?;
    Ok(())
}

#[tauri::command]
fn add_favorite(state: State<AppState>, name: String, path: String) -> Result<AppConfig, String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.favorites.push(Favorite {
        id: Uuid::new_v4().to_string(),
        name,
        path,
    });
    config::save_config(&cfg)?;
    Ok(cfg.clone())
}

#[tauri::command]
fn remove_favorite(state: State<AppState>, id: String) -> Result<AppConfig, String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.favorites.retain(|f| f.id != id);
    config::save_config(&cfg)?;
    Ok(cfg.clone())
}

#[tauri::command]
fn open_in_explorer(path: String) -> Result<(), String> {
    if !std::path::Path::new(&path).exists() {
        return Err("Ce chemin n'existe pas.".to_string());
    }
    std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn import_config(state: State<AppState>, json_content: String) -> Result<AppConfig, String> {
    let imported: AppConfig = serde_json::from_str(&json_content)
        .map_err(|e| format!("Fichier de sauvegarde invalide : {e}"))?;
    let mut cfg = state.config.lock().unwrap();
    *cfg = imported;
    config::save_config(&cfg)?;
    Ok(cfg.clone())
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    files::write_text_file(&path, &content)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    files::read_text_file(&path)
}

// ---------- EXPLORATEUR DE FICHIERS ----------

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<files::FileEntry>, String> {
    files::list_directory(&path)
}

#[tauri::command]
fn create_folder(parent: String, name: String) -> Result<(), String> {
    files::create_folder(&parent, &name)
}

#[tauri::command]
fn create_file_entry(parent: String, name: String) -> Result<(), String> {
    files::create_file(&parent, &name)
}

#[tauri::command]
fn rename_entry(path: String, new_name: String) -> Result<(), String> {
    files::rename(&path, &new_name)
}

#[tauri::command]
fn delete_entry(path: String) -> Result<(), String> {
    files::delete(&path)
}

#[tauri::command]
fn copy_entry(source: String, destination_dir: String) -> Result<(), String> {
    files::copy_item(&source, &destination_dir)
}

#[tauri::command]
fn move_entry(source: String, destination_dir: String) -> Result<(), String> {
    files::move_item(&source, &destination_dir)
}

#[tauri::command]
fn update_launch_args(state: State<AppState>, id: String, launch_args: String) -> Result<AppConfig, String> {
    let mut cfg = state.config.lock().unwrap();
    let game = cfg.games.iter_mut().find(|g| g.id == id).ok_or("Jeu introuvable.")?;
    game.launch_args = launch_args;
    config::save_config(&cfg)?;
    Ok(cfg.clone())
}

#[tauri::command]
fn save_game_profiles(
    state: State<AppState>,
    id: String,
    profiles: Vec<games::GameProfile>,
    active_profile_id: Option<String>,
) -> Result<AppConfig, String> {
    let mut cfg = state.config.lock().unwrap();
    let game = cfg.games.iter_mut().find(|g| g.id == id).ok_or("Jeu introuvable.")?;
    game.profiles = profiles;
    game.active_profile_id = active_profile_id;
    config::save_config(&cfg)?;
    Ok(cfg.clone())
}

// ---------- GESTIONNAIRE DE MODS ----------

#[tauri::command]
fn set_mods_folder(state: State<AppState>, id: String, path: String) -> Result<AppConfig, String> {
    if !std::path::Path::new(&path).is_dir() {
        return Err("Ce dossier n'existe pas.".to_string());
    }
    let mut cfg = state.config.lock().unwrap();
    let game = cfg.games.iter_mut().find(|g| g.id == id).ok_or("Jeu introuvable.")?;
    game.mods_folder = Some(path);
    config::save_config(&cfg)?;
    Ok(cfg.clone())
}

#[tauri::command]
fn add_mod(state: State<AppState>, id: String, source_path: String, name: String) -> Result<AppConfig, String> {
    let entry = mods::add_mod(&id, &source_path, &name)?;
    let mut cfg = state.config.lock().unwrap();
    let game = cfg.games.iter_mut().find(|g| g.id == id).ok_or("Jeu introuvable.")?;
    game.mods.push(entry);
    config::save_config(&cfg)?;
    Ok(cfg.clone())
}

#[tauri::command]
fn toggle_mod(state: State<AppState>, id: String, mod_id: String, enable: bool) -> Result<AppConfig, String> {
    let mut cfg = state.config.lock().unwrap();
    let game = cfg.games.iter_mut().find(|g| g.id == id).ok_or("Jeu introuvable.")?;
    let mods_folder = game
        .mods_folder
        .clone()
        .ok_or("Configure d'abord le dossier de mods de ce jeu.")?;
    let m = game.mods.iter_mut().find(|m| m.id == mod_id).ok_or("Mod introuvable.")?;

    if enable {
        mods::enable_mod(&mods_folder, &m.storage_path)?;
    } else {
        mods::disable_mod(&mods_folder, &m.storage_path)?;
    }
    m.enabled = enable;
    config::save_config(&cfg)?;
    Ok(cfg.clone())
}

#[tauri::command]
fn delete_mod(state: State<AppState>, id: String, mod_id: String) -> Result<AppConfig, String> {
    let mut cfg = state.config.lock().unwrap();
    let game = cfg.games.iter_mut().find(|g| g.id == id).ok_or("Jeu introuvable.")?;
    let mods_folder = game.mods_folder.clone();
    let m = game.mods.iter().find(|m| m.id == mod_id).ok_or("Mod introuvable.")?.clone();

    mods::delete_mod(&id, &mod_id, mods_folder.as_deref(), &m.storage_path)?;
    game.mods.retain(|m| m.id != mod_id);
    config::save_config(&cfg)?;
    Ok(cfg.clone())
}

/// Applique la liste de mods définie par un profil : active exactement les mods
/// de la liste, désactive tous les autres. L'état sur le disque correspond
/// toujours à ce que montre Nyro après cette opération.
#[tauri::command]
fn apply_profile_mods(state: State<AppState>, id: String, profile_id: String) -> Result<AppConfig, String> {
    let mut cfg = state.config.lock().unwrap();
    let game = cfg.games.iter_mut().find(|g| g.id == id).ok_or("Jeu introuvable.")?;
    let mods_folder = game
        .mods_folder
        .clone()
        .ok_or("Configure d'abord le dossier de mods de ce jeu.")?;
    let profile = game
        .profiles
        .iter()
        .find(|p| p.id == profile_id)
        .ok_or("Profil introuvable.")?
        .clone();

    for m in game.mods.iter_mut() {
        let should_be_enabled = profile.active_mod_ids.contains(&m.id);
        if should_be_enabled != m.enabled {
            if should_be_enabled {
                mods::enable_mod(&mods_folder, &m.storage_path)?;
            } else {
                mods::disable_mod(&mods_folder, &m.storage_path)?;
            }
            m.enabled = should_be_enabled;
        }
    }

    config::save_config(&cfg)?;
    Ok(cfg.clone())
}

// ---------- DÉTECTION AUTOMATIQUE ----------

#[tauri::command]
fn detect_games(state: State<AppState>) -> Vec<detect::DetectedGame> {
    let cfg = state.config.lock().unwrap();

    let mut found = detect::detect_steam_games();
    found.extend(detect::detect_games_root_folders());

    // On ne propose jamais un jeu déjà présent dans la bibliothèque.
    found.retain(|d| {
        !cfg.games.iter().any(|g| {
            (d.source == "steam" && g.steam_app_id.as_deref() == d.steam_app_id.as_deref())
                || (d.source != "steam" && g.executable_path == d.executable_path)
        })
    });

    found
}

#[tauri::command]
fn confirm_detected_games(
    state: State<AppState>,
    games: Vec<detect::DetectedGame>,
) -> Result<AppConfig, String> {
    let mut cfg = state.config.lock().unwrap();
    for d in games {
        cfg.games.push(Game {
            id: Uuid::new_v4().to_string(),
            name: d.name,
            executable_path: d.executable_path,
            folder_path: d.folder_path,
            category: if d.source == "steam" {
                "Steam".to_string()
            } else {
                String::new()
            },
            tags: vec![],
            launch_args: String::new(),
            last_played: None,
            cover_image: None,
            logo_image: None,
            source: d.source,
            steam_app_id: d.steam_app_id,
            profiles: vec![],
            active_profile_id: None,
            mods: vec![],
            mods_folder: None,
            total_playtime_seconds: 0,
        });
    }
    config::save_config(&cfg)?;
    Ok(cfg.clone())
}

// ---------- RECHERCHE GLOBALE ----------

#[tauri::command]
fn global_search(state: State<AppState>, query: String) -> Vec<search::SearchResult> {
    let cfg = state.config.lock().unwrap();
    search::search(&cfg, &query)
}

/// Ouvre un fichier avec son application par défaut, ou un dossier dans l'Explorateur.
/// Ne lance jamais rien d'autre que ce que Windows ferait pour un double-clic normal.
#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    if !std::path::Path::new(&path).exists() {
        return Err("Ce chemin n'existe pas.".to_string());
    }
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &path])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn fetch_online_logos(
    state: State<'_, AppState>,
    sgdb_id: i64,
) -> Result<Vec<metadata::OnlineCoverOption>, String> {
    let api_key = {
        let cfg = state.config.lock().unwrap();
        cfg.settings.steamgriddb_api_key.clone()
    };
    let api_key = api_key.ok_or("Ajoute ta clé API SteamGridDB dans Paramètres d'abord.")?;
    metadata::fetch_logos(&api_key, sgdb_id).await
}

#[tauri::command]
async fn apply_online_logo(state: State<'_, AppState>, id: String, image_url: String) -> Result<AppConfig, String> {
    let data_url = metadata::download_image_as_data_url(&image_url).await?;
    let mut cfg = state.config.lock().unwrap();
    let game = cfg.games.iter_mut().find(|g| g.id == id).ok_or("Jeu introuvable.")?;
    game.logo_image = Some(data_url);
    config::save_config(&cfg)?;
    Ok(cfg.clone())
}

#[tauri::command]
async fn fetch_game_media(state: State<'_, AppState>, id: String) -> Result<metadata::GameMedia, String> {
    let (source, steam_app_id, name, youtube_api_key, igdb_client_id, igdb_client_secret) = {
        let cfg = state.config.lock().unwrap();
        let game = cfg.games.iter().find(|g| g.id == id).ok_or("Jeu introuvable.")?;
        (
            game.source.clone(),
            game.steam_app_id.clone(),
            game.name.clone(),
            cfg.settings.youtube_api_key.clone(),
            cfg.settings.igdb_client_id.clone(),
            cfg.settings.igdb_client_secret.clone(),
        )
    };

    let query = metadata::clean_game_title(&name);

    let app_id = if source == "steam" {
        steam_app_id
    } else {
        metadata::search_steam_appid(&query).await.unwrap_or(None)
    };

    let mut media = match app_id {
        Some(app_id) => metadata::fetch_steam_media(&app_id).await.unwrap_or_default(),
        None => metadata::GameMedia::default(),
    };

    if media.trailer_url.is_none() && media.trailer_youtube_id.is_none() {
        if let (Some(client_id), Some(client_secret)) = (igdb_client_id, igdb_client_secret) {
            if !client_id.trim().is_empty() && !client_secret.trim().is_empty() {
                media.trailer_youtube_id =
                    metadata::search_igdb_trailer(&client_id, &client_secret, &query).await;
            }
        }
    }

    if media.trailer_url.is_none() && media.trailer_youtube_id.is_none() {
        if let Some(yt_key) = youtube_api_key {
            if let Ok(video_id) = metadata::search_youtube_trailer(&yt_key, &query).await {
                media.trailer_youtube_id = video_id;
            }
        }
    }

    Ok(media)
}

/// Applique automatiquement cover ET logo à tous les jeux qui n'en ont pas
/// déjà (ne remplace jamais une donnée déjà définie, custom ou récupérée
/// avant). Émet une progression en temps réel pendant l'opération.
#[tauri::command]
async fn bulk_apply_covers(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let (api_key, targets): (Option<String>, Vec<(String, String, bool, bool)>) = {
        let cfg = state.config.lock().unwrap();
        let targets = cfg
            .games
            .iter()
            .filter(|g| g.cover_image.is_none() || g.logo_image.is_none())
            .map(|g| (g.id.clone(), g.name.clone(), g.cover_image.is_none(), g.logo_image.is_none()))
            .collect();
        (cfg.settings.steamgriddb_api_key.clone(), targets)
    };

    let total = targets.len();
    for (i, (game_id, name, needs_cover, needs_logo)) in targets.into_iter().enumerate() {
        let query = metadata::clean_game_title(&name);
        let _ = app.emit(
            "bulk-cover-progress",
            serde_json::json!({ "done": i, "total": total, "gameName": name, "found": null }),
        );

        let sgdb_id = if let Some(api_key) = api_key.as_ref() {
            metadata::search_game(api_key, &query)
                .await
                .ok()
                .and_then(|matches| metadata::pick_best_match(matches, &query).map(|m| m.id))
        } else {
            None
        };

        let mut applied_anything = false;

        if let Some(sgdb_id) = sgdb_id {
            if needs_cover {
                if let Some(data_url) = async {
                    let covers = metadata::fetch_covers(api_key.as_ref()?, sgdb_id).await.ok()?;
                    let cover = covers.first()?;
                    metadata::download_image_as_data_url(&cover.url).await.ok()
                }
                .await
                {
                    let mut cfg = state.config.lock().unwrap();
                    if let Some(game) = cfg.games.iter_mut().find(|g| g.id == game_id) {
                        game.cover_image = Some(data_url);
                    }
                    let _ = config::save_config(&cfg);
                    applied_anything = true;
                }
            }

            if needs_logo {
                if let Some(data_url) = async {
                    let logos = metadata::fetch_logos(api_key.as_ref()?, sgdb_id).await.ok()?;
                    let logo = logos.first()?;
                    metadata::download_image_as_data_url(&logo.url).await.ok()
                }
                .await
                {
                    let mut cfg = state.config.lock().unwrap();
                    if let Some(game) = cfg.games.iter_mut().find(|g| g.id == game_id) {
                        game.logo_image = Some(data_url);
                    }
                    let _ = config::save_config(&cfg);
                    applied_anything = true;
                }
            }
        } else if needs_cover {
            if let Some(app_id) = metadata::search_steam_appid(&query).await.unwrap_or(None) {
                if let Ok(Some(data_url)) = metadata::fetch_steam_library_cover(&app_id).await {
                    let mut cfg = state.config.lock().unwrap();
                    if let Some(game) = cfg.games.iter_mut().find(|g| g.id == game_id) {
                        game.cover_image = Some(data_url);
                    }
                    let _ = config::save_config(&cfg);
                    applied_anything = true;
                }
            }
        }

        let _ = app.emit(
            "bulk-cover-progress",
            serde_json::json!({ "done": i + 1, "total": total, "gameName": name, "found": applied_anything }),
        );
    }

    Ok(())
}

// ---------- COVERS EN LIGNE (SteamGridDB) ----------

#[tauri::command]
async fn search_online_game(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<metadata::OnlineGameMatch>, String> {
    let api_key = {
        let cfg = state.config.lock().unwrap();
        cfg.settings.steamgriddb_api_key.clone()
    };
    let api_key = api_key.ok_or("Ajoute ta clé API SteamGridDB dans Paramètres d'abord.")?;
    let query = metadata::clean_game_title(&query);
    metadata::search_game(&api_key, &query).await
}

#[tauri::command]
async fn fetch_online_covers(
    state: State<'_, AppState>,
    sgdb_id: i64,
) -> Result<Vec<metadata::OnlineCoverOption>, String> {
    let api_key = {
        let cfg = state.config.lock().unwrap();
        cfg.settings.steamgriddb_api_key.clone()
    };
    let api_key = api_key.ok_or("Ajoute ta clé API SteamGridDB dans Paramètres d'abord.")?;
    metadata::fetch_covers(&api_key, sgdb_id).await
}

#[tauri::command]
async fn apply_online_cover(
    state: State<'_, AppState>,
    id: String,
    image_url: String,
    corrected_name: Option<String>,
) -> Result<AppConfig, String> {
    let data_url = metadata::download_image_as_data_url(&image_url).await?;
    let mut cfg = state.config.lock().unwrap();
    let game = cfg.games.iter_mut().find(|g| g.id == id).ok_or("Jeu introuvable.")?;
    game.cover_image = Some(data_url);
    if let Some(name) = corrected_name {
        if !name.trim().is_empty() {
            game.name = name.trim().to_string();
        }
    }
    config::save_config(&cfg)?;
    Ok(cfg.clone())
}

#[tauri::command]
async fn fetch_steam_achievements(
    state: State<'_, AppState>,
    game_id: String,
) -> Result<Vec<metadata::SteamAchievementDisplay>, String> {
    let (api_key, steam_id64, app_id) = {
        let cfg = state.config.lock().unwrap();
        let game = cfg.games.iter().find(|g| g.id == game_id).ok_or("Jeu introuvable.")?;
        if game.source != "steam" {
            return Err("Ce jeu n'est pas un jeu Steam.".to_string());
        }
        let app_id = game.steam_app_id.clone().ok_or("Identifiant Steam manquant.")?;
        (
            cfg.settings.steam_api_key.clone(),
            cfg.settings.steam_id64.clone(),
            app_id,
        )
    };
    let api_key = api_key.ok_or("Ajoute ta clé API Steam dans Paramètres d'abord.")?;
    let steam_id64 = steam_id64.ok_or("Ajoute ton SteamID64 dans Paramètres d'abord.")?;
    metadata::fetch_player_achievements(&api_key, &steam_id64, &app_id).await
}

// ---------- ARCHIVES ----------

#[tauri::command]
async fn extract_archive(app: tauri::AppHandle, zip_path: String, dest_dir: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        archives::extract_any(&zip_path, &dest_dir, |done, total| {
            let _ = app.emit("archive-progress", serde_json::json!({ "done": done, "total": total }));
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn compress_to_archive(app: tauri::AppHandle, source_path: String, zip_dest: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        archives::compress_to_zip(&source_path, &zip_dest, |done, total| {
            let _ = app.emit("archive-progress", serde_json::json!({ "done": done, "total": total }));
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------- FENÊTRE MINIATURE ----------

#[tauri::command]
fn open_mini_mode(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("mini") {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(&app, "mini", tauri::WebviewUrl::App("index.html".into()))
        .title("Nyro Mini")
        .inner_size(280.0, 170.0)
        .resizable(false)
        .always_on_top(true)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn focus_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
    Ok(())
}

// ---------- INTÉGRATION WINDOWS ----------

#[tauri::command]
fn get_pending_action(state: State<AppState>) -> Option<PendingAction> {
    state.pending_action.lock().unwrap().take()
}

#[tauri::command]
fn install_context_menu() -> Result<(), String> {
    context_menu::install_context_menu()
}

#[tauri::command]
fn remove_context_menu() -> Result<(), String> {
    context_menu::remove_context_menu()
}

#[tauri::command]
fn is_context_menu_installed() -> bool {
    context_menu::is_context_menu_installed()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(action) = parse_launch_args(&argv) {
                let state = app.state::<AppState>();
                *state.pending_action.lock().unwrap() = Some(action.clone());
                let _ = app.emit("pending-action", action);
            }
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    let search_shortcut = Shortcut::new(Some(Modifiers::CONTROL), Code::Space);
                    if shortcut == &search_shortcut && event.state() == ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        let _ = app.emit("open-search", ());
                    }
                })
                .build(),
        )
        .setup(|app| {
            let launch_args: Vec<String> = std::env::args().collect();
            if let Some(action) = parse_launch_args(&launch_args) {
                let state = app.state::<AppState>();
                *state.pending_action.lock().unwrap() = Some(action);
            }

            let search_shortcut = Shortcut::new(Some(Modifiers::CONTROL), Code::Space);
            app.global_shortcut().register(search_shortcut)?;

            let open_item = MenuItem::with_id(app, "open", "Ouvrir Nyro", true, None::<&str>)?;
            let search_item = MenuItem::with_id(app, "search", "Recherche", true, None::<&str>)?;
            let settings_item = MenuItem::with_id(app, "settings", "Paramètres", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&open_item, &search_item, &settings_item, &quit_item])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Nyro")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "search" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                        let _ = app.emit("open-search", ());
                    }
                    "settings" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                        let _ = app.emit("navigate", "settings");
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Fermer la fenêtre principale réduit dans la zone de notification
            // au lieu de quitter Nyro ; "Quitter" dans le menu du tray ferme vraiment.
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                });
            }

            Ok(())
        })
        .manage(AppState {
            config: Mutex::new(config::load_config()),
            pending_action: Mutex::new(None),
        })
        .manage(SystemState {
            sys: Mutex::new(sysinfo::System::new_all()),
            nvml: Nvml::init().ok(),
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            add_game,
            remove_game,
            update_game,
            launch_game,
            set_game_cover,
            add_favorite,
            remove_favorite,
            open_in_explorer,
            list_directory,
            create_folder,
            create_file_entry,
            rename_entry,
            delete_entry,
            copy_entry,
            move_entry,
            global_search,
            open_path,
            detect_games,
            confirm_detected_games,
            update_launch_args,
            save_game_profiles,
            set_mods_folder,
            add_mod,
            toggle_mod,
            delete_mod,
            apply_profile_mods,
            get_system_stats,
            fetch_steam_achievements,
            write_text_file,
            read_text_file,
            import_config,
            update_settings,
            search_online_game,
            fetch_online_covers,
            apply_online_cover,
            fetch_online_logos,
            apply_online_logo,
            fetch_game_media,
            bulk_apply_covers,
            extract_archive,
            compress_to_archive,
            open_mini_mode,
            focus_main_window,
            get_pending_action,
            install_context_menu,
            remove_context_menu,
            is_context_menu_installed,
        ])
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de Nyro");
}
