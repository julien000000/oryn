use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::files;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModEntry {
    pub id: String,
    pub name: String,
    /// Copie maîtresse gérée par NEXUS, jamais modifiée directement par le jeu.
    pub storage_path: String,
    pub enabled: bool,
}

fn mods_master_dir(game_id: &str) -> Result<PathBuf, String> {
    let mut dir = dirs::config_dir().ok_or("Impossible de localiser %APPDATA%")?;
    dir.push("NEXUS");
    dir.push("mods");
    dir.push(game_id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Copie la source (fichier ou dossier) dans le stockage maîtresse NEXUS pour ce jeu.
/// La source d'origine n'est jamais modifiée ni déplacée.
pub fn add_mod(game_id: &str, source_path: &str, name: &str) -> Result<ModEntry, String> {
    let src = Path::new(source_path);
    if !src.exists() {
        return Err("Le fichier ou dossier source est introuvable.".to_string());
    }

    let mod_id = Uuid::new_v4().to_string();
    let master_dir = mods_master_dir(game_id)?.join(&mod_id);
    fs::create_dir_all(&master_dir).map_err(|e| e.to_string())?;

    let file_name = src.file_name().ok_or("Nom de fichier invalide.")?;
    let dest = master_dir.join(file_name);

    if src.is_dir() {
        copy_dir_recursive(src, &dest)?;
    } else {
        fs::copy(src, &dest).map_err(|e| e.to_string())?;
    }

    Ok(ModEntry {
        id: mod_id,
        name: name.to_string(),
        storage_path: dest.to_string_lossy().to_string(),
        enabled: false,
    })
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        let target = dest.join(entry.file_name());
        if path.is_dir() {
            copy_dir_recursive(&path, &target)?;
        } else {
            fs::copy(&path, &target).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Active un mod : copie la copie maîtresse dans le dossier mods réel du jeu.
pub fn enable_mod(mods_folder: &str, storage_path: &str) -> Result<(), String> {
    if !Path::new(mods_folder).is_dir() {
        return Err("Le dossier de mods de ce jeu n'est pas configuré ou introuvable.".to_string());
    }
    // On retire d'abord une éventuelle copie existante pour repartir propre.
    let _ = disable_mod(mods_folder, storage_path);
    files::copy_item(storage_path, mods_folder)
}

/// Désactive un mod : retire sa copie du dossier mods du jeu. La copie maîtresse
/// NEXUS n'est jamais touchée, le mod reste réactivable à tout moment.
pub fn disable_mod(mods_folder: &str, storage_path: &str) -> Result<(), String> {
    let file_name = Path::new(storage_path)
        .file_name()
        .ok_or("Chemin de mod invalide.")?;
    let installed_path = Path::new(mods_folder).join(file_name);
    if !installed_path.exists() {
        return Ok(()); // déjà désactivé, rien à faire
    }
    if installed_path.is_dir() {
        fs::remove_dir_all(&installed_path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(&installed_path).map_err(|e| e.to_string())
    }
}

/// Supprime totalement un mod : le désactive puis efface sa copie maîtresse.
pub fn delete_mod(game_id: &str, mod_id: &str, mods_folder: Option<&str>, storage_path: &str) -> Result<(), String> {
    if let Some(folder) = mods_folder {
        let _ = disable_mod(folder, storage_path);
    }
    let master_dir = mods_master_dir(game_id)?.join(mod_id);
    if master_dir.exists() {
        fs::remove_dir_all(&master_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}
