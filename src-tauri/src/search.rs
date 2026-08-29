use serde::Serialize;
use std::path::Path;

use crate::config::AppConfig;

#[derive(Debug, Serialize, Clone)]
pub struct SearchResult {
    pub kind: String, // "game" | "favorite" | "folder" | "file"
    pub label: String,
    pub subtitle: String,
    pub path: Option<String>,
    pub game_id: Option<String>,
}

const MAX_RESULTS: usize = 40;
const MAX_DEPTH: usize = 3;

/// Cherche dans les jeux, les favoris, puis dans les fichiers/dossiers
/// à l'intérieur de chaque favori (profondeur bornée pour rester rapide,
/// pas de scan du disque entier).
pub fn search(config: &AppConfig, query: &str) -> Vec<SearchResult> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return vec![];
    }

    let mut results = Vec::new();

    for game in &config.games {
        let matches = game.name.to_lowercase().contains(&q)
            || game.category.to_lowercase().contains(&q)
            || game.tags.iter().any(|t| t.to_lowercase().contains(&q));
        if matches {
            results.push(SearchResult {
                kind: "game".to_string(),
                label: game.name.clone(),
                subtitle: if game.category.is_empty() {
                    "Jeu".to_string()
                } else {
                    game.category.clone()
                },
                path: Some(game.executable_path.clone()),
                game_id: Some(game.id.clone()),
            });
        }
    }

    for fav in &config.favorites {
        if fav.name.to_lowercase().contains(&q) {
            results.push(SearchResult {
                kind: "favorite".to_string(),
                label: fav.name.clone(),
                subtitle: fav.path.clone(),
                path: Some(fav.path.clone()),
                game_id: None,
            });
        }
    }

    for fav in &config.favorites {
        if results.len() >= MAX_RESULTS {
            break;
        }
        search_dir(Path::new(&fav.path), &q, 0, &mut results);
    }

    results.truncate(MAX_RESULTS);
    results
}

fn search_dir(dir: &Path, query: &str, depth: usize, results: &mut Vec<SearchResult>) {
    if depth > MAX_DEPTH || results.len() >= MAX_RESULTS {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        if results.len() >= MAX_RESULTS {
            return;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();
        let is_dir = path.is_dir();

        if name.to_lowercase().contains(query) {
            results.push(SearchResult {
                kind: if is_dir { "folder" } else { "file" }.to_string(),
                label: name.clone(),
                subtitle: path.to_string_lossy().to_string(),
                path: Some(path.to_string_lossy().to_string()),
                game_id: None,
            });
        }

        if is_dir {
            search_dir(&path, query, depth + 1, results);
        }
    }
}
