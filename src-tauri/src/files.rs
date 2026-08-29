use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<String>,
    pub extension: Option<String>,
}

/// Liste le contenu d'un dossier. Ne descend jamais récursivement :
/// une seule profondeur à la fois, comme un vrai explorateur.
pub fn list_directory(path: &str) -> Result<Vec<FileEntry>, String> {
    let dir = Path::new(path);
    if !dir.is_dir() {
        return Err("Ce chemin n'est pas un dossier valide.".to_string());
    }

    let mut entries = Vec::new();
    let read_dir = fs::read_dir(dir).map_err(|e| format!("Impossible de lire le dossier : {e}"))?;

    for entry in read_dir.flatten() {
        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        let path_str = entry.path().to_string_lossy().to_string();
        let is_dir = metadata.is_dir();
        let extension = if is_dir {
            None
        } else {
            entry
                .path()
                .extension()
                .map(|e| e.to_string_lossy().to_string())
        };
        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs().to_string());

        entries.push(FileEntry {
            name,
            path: path_str,
            is_dir,
            size: if is_dir { 0 } else { metadata.len() },
            modified,
            extension,
        });
    }

    // Dossiers d'abord, puis tri alphabétique
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

const WINDOWS_FORBIDDEN_CHARS: &[char] = &['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

fn validate_name(name: &str) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Le nom ne peut pas être vide.".to_string());
    }
    if trimmed.chars().any(|c| WINDOWS_FORBIDDEN_CHARS.contains(&c)) {
        return Err(format!(
            "Le nom contient un caractère interdit sous Windows ({}).",
            WINDOWS_FORBIDDEN_CHARS.iter().collect::<String>()
        ));
    }
    Ok(())
}

pub fn write_text_file(path: &str, content: &str) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
}

pub fn read_text_file(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

pub fn create_folder(parent: &str, name: &str) -> Result<(), String> {
    validate_name(name)?;
    let path = PathBuf::from(parent).join(name.trim());
    if path.exists() {
        return Err("Un élément porte déjà ce nom.".to_string());
    }
    fs::create_dir(&path).map_err(|e| format!("{e}"))
}

pub fn create_file(parent: &str, name: &str) -> Result<(), String> {
    validate_name(name)?;
    let path = PathBuf::from(parent).join(name.trim());
    if path.exists() {
        return Err("Un élément porte déjà ce nom.".to_string());
    }
    fs::write(&path, "").map_err(|e| format!("{e}"))
}

pub fn rename(path: &str, new_name: &str) -> Result<(), String> {
    let old_path = Path::new(path);
    let new_path = old_path
        .parent()
        .ok_or("Chemin invalide.")?
        .join(new_name);
    if new_path.exists() {
        return Err("Un élément porte déjà ce nom.".to_string());
    }
    fs::rename(old_path, new_path).map_err(|e| e.to_string())
}

/// Suppression réelle (pas de corbeille depuis Rust std) : le frontend
/// DOIT demander confirmation avant d'appeler cette commande.
pub fn delete(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        fs::remove_file(p).map_err(|e| e.to_string())
    }
}

pub fn copy_item(source: &str, destination_dir: &str) -> Result<(), String> {
    let src = Path::new(source);
    let file_name = src.file_name().ok_or("Nom de fichier invalide.")?;
    let dest = PathBuf::from(destination_dir).join(file_name);

    if dest.exists() {
        return Err("Un élément porte déjà ce nom à destination.".to_string());
    }

    if src.is_dir() {
        copy_dir_recursive(src, &dest)
    } else {
        fs::copy(src, &dest).map(|_| ()).map_err(|e| e.to_string())
    }
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

pub fn move_item(source: &str, destination_dir: &str) -> Result<(), String> {
    let src = Path::new(source);
    let file_name = src.file_name().ok_or("Nom de fichier invalide.")?;
    let dest = PathBuf::from(destination_dir).join(file_name);
    if dest.exists() {
        return Err("Un élément porte déjà ce nom à destination.".to_string());
    }
    fs::rename(src, &dest).map_err(|e| e.to_string())
}
