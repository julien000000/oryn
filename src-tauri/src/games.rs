use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use sysinfo::System;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GameProfile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub launch_args: String,
    #[serde(default)]
    pub executable_override: Option<String>,
    #[serde(default)]
    pub active_mod_ids: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Game {
    pub id: String,
    pub name: String,
    pub executable_path: String,
    #[serde(default)]
    pub folder_path: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub launch_args: String,
    #[serde(default)]
    pub last_played: Option<String>,
    #[serde(default)]
    pub cover_image: Option<String>,
    #[serde(default)]
    pub logo_image: Option<String>,
    #[serde(default = "default_source")]
    pub source: String, // "manual" | "steam" | "custom"
    #[serde(default)]
    pub steam_app_id: Option<String>,
    #[serde(default)]
    pub profiles: Vec<GameProfile>,
    #[serde(default)]
    pub active_profile_id: Option<String>,
    #[serde(default)]
    pub mods: Vec<crate::mods::ModEntry>,
    #[serde(default)]
    pub mods_folder: Option<String>,
    #[serde(default)]
    pub total_playtime_seconds: u64,
}

fn default_source() -> String {
    "manual".to_string()
}

/// Lit une image locale et la convertit en data URL base64, pour l'afficher
/// directement dans le frontend sans avoir à gérer les permissions de
/// l'asset protocol Tauri. Limité à 8 Mo pour éviter de gonfler le config.json.
pub fn encode_cover(path: &str) -> Result<String, String> {
    let p = Path::new(path);
    if !p.is_file() {
        return Err("Image introuvable.".to_string());
    }

    let metadata = std::fs::metadata(p).map_err(|e| e.to_string())?;
    if metadata.len() > 8 * 1024 * 1024 {
        return Err("Image trop volumineuse (max 8 Mo).".to_string());
    }

    let bytes = std::fs::read(p).map_err(|e| format!("Impossible de lire l'image : {e}"))?;
    let mime = match p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        _ => return Err("Format d'image non supporté (png, jpg, webp, gif, bmp).".to_string()),
    };

    let encoded = STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
}

/// Lance le jeu, puis suit sa durée réelle de session en surveillant la
/// présence de tout processus dans le dossier d'installation — pas seulement
/// le processus exact lancé. C'est indispensable : beaucoup de jeux passent
/// par un petit lanceur qui démarre le vrai jeu puis se ferme aussitôt ;
/// attendre la fin de ce lanceur donnerait un temps de jeu quasi nul alors
/// que le jeu tourne encore.
pub fn launch_and_track(
    app: tauri::AppHandle,
    game_id: String,
    executable_path: String,
    args: String,
    folder_path: String,
) -> Result<(), String> {
    if !verify_executable(&executable_path) {
        return Err("Exécutable introuvable.".to_string());
    }

    let working_dir = Path::new(&executable_path)
        .parent()
        .ok_or("Impossible de déterminer le dossier de travail.")?
        .to_path_buf();

    let mut cmd = Command::new(&executable_path);
    cmd.current_dir(&working_dir);
    if !args.trim().is_empty() {
        for arg in args.split_whitespace() {
            cmd.arg(arg);
        }
    }

    cmd.spawn().map_err(|e| format!("Échec du lancement : {e}"))?;

    track_folder_playtime(app, game_id, folder_path, 60);
    Ok(())
}

/// Pour les jeux Steam, on ne contrôle pas directement le processus (Steam le
/// lance lui-même) : on utilise donc systématiquement le suivi par dossier.
pub fn track_steam_playtime(app: tauri::AppHandle, game_id: String, folder_path: String) {
    // Steam peut mettre à jour/vérifier les fichiers avant de lancer, donc
    // délai d'attente initial plus long que pour un lancement direct.
    track_folder_playtime(app, game_id, folder_path, 120);
}

/// Surveille la présence de tout processus dont l'exécutable se trouve dans
/// `folder_path` (ou un sous-dossier), du démarrage à la fermeture, et
/// enregistre la durée réelle écoulée. `startup_timeout_secs` borne l'attente
/// initiale avant d'abandonner si rien ne démarre jamais détectablement.
fn track_folder_playtime(app: tauri::AppHandle, game_id: String, folder_path: String, startup_timeout_secs: u64) {
    if folder_path.trim().is_empty() {
        return;
    }
    std::thread::spawn(move || {
        let mut sys = System::new_all();
        let folder_lower = folder_path.to_lowercase();

        let is_running = |sys: &System| -> bool {
            sys.processes().values().any(|p| {
                p.exe()
                    .map(|e| e.to_string_lossy().to_lowercase().starts_with(&folder_lower))
                    .unwrap_or(false)
            })
        };

        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(startup_timeout_secs);
        loop {
            sys.refresh_all();
            if is_running(&sys) {
                break;
            }
            if std::time::Instant::now() > deadline {
                return; // rien n'a démarré détectablement dans le dossier, on abandonne le suivi
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }

        let start = std::time::Instant::now();
        loop {
            std::thread::sleep(std::time::Duration::from_secs(5));
            sys.refresh_all();
            if !is_running(&sys) {
                break;
            }
        }

        let elapsed = start.elapsed().as_secs();
        crate::persist_playtime(&app, &game_id, elapsed);
    });
}

/// Vérifie que l'exécutable existe avant toute tentative de lancement.
/// On ne devine jamais un chemin, on ne lance jamais un fichier inconnu :
/// uniquement l'exécutable explicitement enregistré par l'utilisateur pour ce jeu.
pub fn verify_executable(path: &str) -> bool {
    Path::new(path).is_file()
}

/// Lance un jeu Steam via son protocole officiel (steam://rungameid/<appid>) :
/// c'est Steam lui-même qui gère l'exécutable, les mises à jour et les DLC,
/// on n'a pas besoin (et on ne doit pas essayer) de deviner son .exe.
pub fn launch_steam(app_id: &str) -> Result<(), String> {
    Command::new("cmd")
        .args(["/C", "start", "", &format!("steam://rungameid/{app_id}")])
        .spawn()
        .map_err(|e| format!("Échec du lancement Steam : {e}"))?;
    Ok(())
}

/// Lance le jeu avec ses arguments éventuels. Ne fait rien de plus :
/// pas d'élévation de droits, pas de téléchargement, pas d'action cachée.
pub fn launch(executable_path: &str, args: &str) -> Result<(), String> {
    if !verify_executable(executable_path) {
        return Err("Exécutable introuvable.".to_string());
    }

    let working_dir = Path::new(executable_path)
        .parent()
        .ok_or("Impossible de déterminer le dossier de travail.")?;

    let mut cmd = Command::new(executable_path);
    cmd.current_dir(working_dir);

    if !args.trim().is_empty() {
        for arg in args.split_whitespace() {
            cmd.arg(arg);
        }
    }

    cmd.spawn().map_err(|e| format!("Échec du lancement : {e}"))?;
    Ok(())
}
