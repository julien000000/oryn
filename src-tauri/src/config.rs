use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::games::Game;

/// Structure complète de la configuration NEXUS, sauvegardée en JSON.
/// C'est la source de vérité unique pour les données persistantes du MVP :
/// jeux ajoutés + favoris. Les mods/profils/thèmes viendront s'y ajouter
/// dans les étapes suivantes sans casser ce format (tout est optionnel
/// via #[serde(default)]).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Settings {
    #[serde(default = "default_theme")]
    pub theme: String, // "dark" | "light" | "midnight"
    #[serde(default)]
    pub accent_color: Option<String>, // hex, ex: "#6c5ce7"
    #[serde(default)]
    pub reduce_animations: bool,
    #[serde(default)]
    pub developer_mode: bool,
    #[serde(default)]
    pub steamgriddb_api_key: Option<String>,
    #[serde(default)]
    pub steam_api_key: Option<String>,
    #[serde(default)]
    pub steam_id64: Option<String>,
    #[serde(default)]
    pub youtube_api_key: Option<String>,
    #[serde(default)]
    pub igdb_client_id: Option<String>,
    #[serde(default)]
    pub igdb_client_secret: Option<String>,
    #[serde(default)]
    pub ignored_update_version: Option<String>,
}

fn default_theme() -> String {
    "dark".to_string()
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            theme: default_theme(),
            accent_color: None,
            reduce_animations: false,
            developer_mode: false,
            steamgriddb_api_key: None,
            steam_api_key: None,
            steam_id64: None,
            youtube_api_key: None,
            igdb_client_id: None,
            igdb_client_secret: None,
            ignored_update_version: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct AppConfig {
    #[serde(default)]
    pub games: Vec<Game>,
    #[serde(default)]
    pub favorites: Vec<Favorite>,
    #[serde(default)]
    pub settings: Settings,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Favorite {
    pub id: String,
    pub name: String,
    pub path: String,
}

/// Retourne le chemin du fichier de config : %APPDATA%\NEXUS\config.json sous Windows.
fn config_path() -> PathBuf {
    let mut dir = dirs::config_dir().expect("Impossible de localiser %APPDATA%");
    dir.push("NEXUS");
    fs::create_dir_all(&dir).expect("Impossible de créer le dossier de config NEXUS");
    dir.push("config.json");
    dir
}

pub fn load_config() -> AppConfig {
    let path = config_path();
    if !path.exists() {
        return AppConfig::default();
    }
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    }
}

pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let path = config_path();
    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
}
