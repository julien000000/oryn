use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DetectedGame {
    pub name: String,
    pub executable_path: String,
    pub folder_path: String,
    pub source: String, // "steam" | "custom"
    pub steam_app_id: Option<String>,
}

const IGNORE_EXE_PATTERNS: &[&str] = &[
    "unins", "setup", "redist", "vcredist", "dxsetup", "crashpad", "directx", "dotnetfx",
    "vc_redist", "vcruntime", "ue4prereq", "ueprereq",
];

// ---------- STEAM ----------

fn extract_between_quotes(s: &str, start_from: usize) -> Option<(String, usize)> {
    let bytes: Vec<char> = s.chars().collect();
    let mut i = start_from;
    while i < bytes.len() && bytes[i] != '"' {
        i += 1;
    }
    if i >= bytes.len() {
        return None;
    }
    i += 1;
    let start = i;
    while i < bytes.len() && bytes[i] != '"' {
        i += 1;
    }
    if i >= bytes.len() {
        return None;
    }
    let value: String = bytes[start..i].iter().collect();
    Some((value, i + 1))
}

/// Extrait toutes les valeurs associées à une clé VDF (format texte des fichiers Steam),
/// ex: extraire tous les "path" d'un libraryfolders.vdf.
fn extract_all_vdf_values(content: &str, key: &str) -> Vec<String> {
    let pattern = format!("\"{key}\"");
    let mut results = Vec::new();
    let mut search_from = 0usize;
    let chars: Vec<char> = content.chars().collect();
    let content_str: String = chars.iter().collect();

    while let Some(rel_pos) = content_str[search_from..].find(&pattern) {
        let pos = search_from + rel_pos;
        let after_key = pos + pattern.chars().count();
        if let Some((value, next)) = extract_between_quotes(&content_str, after_key) {
            results.push(value.replace("\\\\", "\\"));
            search_from = next;
        } else {
            break;
        }
    }
    results
}

fn extract_first_vdf_value(content: &str, key: &str) -> Option<String> {
    extract_all_vdf_values(content, key).into_iter().next()
}

fn get_steam_install_path() -> Option<String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let steam_key = hkcu.open_subkey("Software\\Valve\\Steam").ok()?;
    let path: String = steam_key.get_value("SteamPath").ok()?;
    Some(path.replace('/', "\\"))
}

/// Détecte tous les jeux Steam installés : lit le chemin d'installation de Steam
/// dans le registre, parcourt toutes les bibliothèques déclarées (libraryfolders.vdf),
/// puis lit chaque appmanifest_*.acf pour en tirer le nom et l'appid.
pub fn detect_steam_games() -> Vec<DetectedGame> {
    let mut results = Vec::new();
    let mut seen_app_ids = std::collections::HashSet::new();

    let Some(steam_path) = get_steam_install_path() else {
        return results;
    };

    let mut library_dirs = vec![PathBuf::from(&steam_path)];

    let library_vdf = Path::new(&steam_path)
        .join("steamapps")
        .join("libraryfolders.vdf");
    if let Ok(content) = fs::read_to_string(&library_vdf) {
        for path in extract_all_vdf_values(&content, "path") {
            let p = PathBuf::from(path);
            let already_known = library_dirs.iter().any(|existing| {
                existing
                    .to_string_lossy()
                    .to_lowercase()
                    .trim_end_matches(['\\', '/'])
                    == p.to_string_lossy().to_lowercase().trim_end_matches(['\\', '/'])
            });
            if p.exists() && !already_known {
                library_dirs.push(p);
            }
        }
    }

    for lib in library_dirs {
        let steamapps = lib.join("steamapps");
        let Ok(entries) = fs::read_dir(&steamapps) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let is_manifest = path
                .file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with("appmanifest_") && n.ends_with(".acf"))
                .unwrap_or(false);
            if !is_manifest {
                continue;
            }
            let Ok(content) = fs::read_to_string(&path) else {
                continue;
            };
            let name = extract_first_vdf_value(&content, "name");
            let appid = extract_first_vdf_value(&content, "appid");
            let installdir = extract_first_vdf_value(&content, "installdir");

            if let (Some(name), Some(appid), Some(installdir)) = (name, appid, installdir) {
                // Un même jeu peut apparaître dans plusieurs bibliothèques scannées
                // (chemins qui se recoupent) : on ne le garde qu'une seule fois.
                if !seen_app_ids.insert(appid.clone()) {
                    continue;
                }
                let folder = steamapps.join("common").join(&installdir);
                results.push(DetectedGame {
                    name,
                    executable_path: String::new(),
                    folder_path: folder.to_string_lossy().to_string(),
                    source: "steam".to_string(),
                    steam_app_id: Some(appid),
                });
            }
        }
    }

    results
}

// ---------- DOSSIERS CUSTOM (ex: D:\Games) ----------

fn is_ignored_exe(name: &str) -> bool {
    let lower = name.to_lowercase();
    IGNORE_EXE_PATTERNS.iter().any(|p| lower.contains(p))
}

/// Cherche le .exe le plus probable dans un dossier de jeu : on ignore les
/// installeurs/redistribuables connus et on prend le plus gros exécutable
/// restant (heuristique simple mais efficace en pratique).
fn find_main_executable(game_dir: &Path, depth: usize) -> Option<PathBuf> {
    if depth > 3 {
        return None;
    }
    let mut best: Option<(PathBuf, u64)> = None;
    let Ok(entries) = fs::read_dir(game_dir) else {
        return None;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_main_executable(&path, depth + 1) {
                let size = fs::metadata(&found).map(|m| m.len()).unwrap_or(0);
                if best.as_ref().map(|(_, s)| size > *s).unwrap_or(true) {
                    best = Some((found, size));
                }
            }
        } else if path.extension().and_then(|e| e.to_str()) == Some("exe") {
            let name = path.file_stem().and_then(|n| n.to_str()).unwrap_or("");
            if is_ignored_exe(name) {
                continue;
            }
            let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            if best.as_ref().map(|(_, s)| size > *s).unwrap_or(true) {
                best = Some((path, size));
            }
        }
    }
    best.map(|(p, _)| p)
}

/// Scanne un dossier racine (ex: D:\Games) : chaque sous-dossier direct est
/// considéré comme un jeu potentiel, on cherche son exécutable principal dedans.
pub fn scan_games_folder(root: &str) -> Vec<DetectedGame> {
    let mut results = Vec::new();
    let Ok(entries) = fs::read_dir(root) else {
        return results;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if let Some(exe) = find_main_executable(&path, 0) {
            let name = crate::metadata::clean_game_title(
                &path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default(),
            );
            results.push(DetectedGame {
                name,
                executable_path: exe.to_string_lossy().to_string(),
                folder_path: path.to_string_lossy().to_string(),
                source: "custom".to_string(),
                steam_app_id: None,
            });
        }
    }
    results
}

/// Cherche un dossier "Games" à la racine de chaque disque détecté (A: à Z:)
/// et le scanne s'il existe. Ne touche à aucun autre emplacement du disque.
pub fn detect_games_root_folders() -> Vec<DetectedGame> {
    let mut results = Vec::new();
    for letter in b'A'..=b'Z' {
        let drive = format!("{}:\\", letter as char);
        if !Path::new(&drive).exists() {
            continue;
        }
        let games_folder = format!("{drive}Games");
        if Path::new(&games_folder).is_dir() {
            results.extend(scan_games_folder(&games_folder));
        }
    }
    results
}
