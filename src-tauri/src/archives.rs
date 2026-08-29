use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use zip::write::FileOptions;
use zip::ZipArchive;

fn find_7zip() -> Option<PathBuf> {
    [
        r"C:\Program Files\7-Zip\7z.exe",
        r"C:\Program Files (x86)\7-Zip\7z.exe",
    ]
    .into_iter()
    .map(PathBuf::from)
    .find(|p| p.exists())
}

/// Extrait n'importe quel format (zip, rar, 7z...) si 7-Zip est installé sur
/// la machine. Sinon, se rabat sur l'extraction ZIP native. `on_progress`
/// reçoit (fait, total) ; pour le chemin 7-Zip externe, total=0 signifie
/// "progression indéterminée" (pas de pourcentage fiable sans parser sa sortie).
pub fn extract_any(
    archive_path: &str,
    dest_dir: &str,
    on_progress: impl FnMut(usize, usize),
) -> Result<(), String> {
    if let Some(seven_zip) = find_7zip() {
        std::fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;
        return extract_with_7zip_progress(&seven_zip, archive_path, dest_dir, on_progress);
    }

    let lower = archive_path.to_lowercase();
    if lower.ends_with(".zip") {
        return extract_zip(archive_path, dest_dir, on_progress);
    }

    Err("Ce format nécessite 7-Zip pour être extrait. Installe-le gratuitement sur \
         https://www.7-zip.org (Nyro le détectera automatiquement au prochain lancement), \
         ou réessaie avec un fichier .zip."
        .to_string())
}

/// Lance 7-Zip en lisant sa sortie en direct pour en extraire le vrai
/// pourcentage de progression (via -bsp1), au lieu d'attendre en silence
/// que le processus se termine sans aucun retour.
fn extract_with_7zip_progress(
    seven_zip: &Path,
    archive_path: &str,
    dest_dir: &str,
    mut on_progress: impl FnMut(usize, usize),
) -> Result<(), String> {
    let mut child = Command::new(seven_zip)
        .args(["x", archive_path, &format!("-o{dest_dir}"), "-y", "-bsp1", "-bb0"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Impossible de lancer 7-Zip : {e}"))?;

    if let Some(stdout) = child.stdout.take() {
        let mut reader = stdout;
        let mut buf = [0u8; 256];
        let mut acc = String::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    acc.push_str(&String::from_utf8_lossy(&buf[..n]));
                    if let Some(percent) = last_percent_in(&acc) {
                        on_progress(percent, 100);
                    }
                    if acc.len() > 4096 {
                        let tail_start = acc.len() - 256;
                        acc = acc[tail_start..].to_string();
                    }
                }
                Err(_) => break,
            }
        }
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("7-Zip a signalé une erreur pendant l'extraction.".to_string());
    }
    on_progress(100, 100);
    Ok(())
}

/// Cherche la dernière occurrence "NN%" dans un flux de texte (7-Zip redessine
/// sa ligne de progression avec des retours chariot, pas des retours à la ligne).
fn last_percent_in(s: &str) -> Option<usize> {
    let bytes = s.as_bytes();
    let mut best: Option<usize> = None;
    for i in 0..bytes.len() {
        if bytes[i] == b'%' {
            let mut j = i;
            while j > 0 && bytes[j - 1].is_ascii_digit() {
                j -= 1;
            }
            if j < i {
                if let Ok(n) = s[j..i].parse::<usize>() {
                    if n <= 100 {
                        best = Some(n);
                    }
                }
            }
        }
    }
    best
}

/// Extrait une archive ZIP. Chaque fichier est copié en flux (io::copy),
/// jamais chargé entièrement en mémoire, donc aucun risque de saturation RAM
/// même sur de très gros fichiers.
pub fn extract_zip(
    zip_path: &str,
    dest_dir: &str,
    mut on_progress: impl FnMut(usize, usize),
) -> Result<(), String> {
    let file = File::open(zip_path).map_err(|e| format!("Impossible d'ouvrir l'archive : {e}"))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("Archive invalide : {e}"))?;
    std::fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;

    let total = archive.len();
    for i in 0..total {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = match entry.enclosed_name() {
            Some(p) => Path::new(dest_dir).join(p),
            None => continue, // chemin suspect dans l'archive, ignoré par sécurité
        };

        if entry.is_dir() {
            std::fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut outfile = File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut outfile).map_err(|e| e.to_string())?;
        }
        on_progress(i + 1, total);
    }
    Ok(())
}

fn count_files(path: &Path) -> usize {
    if path.is_file() {
        return 1;
    }
    let mut count = 0;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                count += count_files(&p);
            } else {
                count += 1;
            }
        }
    }
    count
}

/// Compresse un fichier ou un dossier entier. Chaque fichier est copié en
/// flux directement dans l'archive (io::copy), jamais bufferisé en entier
/// en mémoire : compresser un dossier de jeu de 50 Go ne consomme que
/// quelques Ko de RAM à la fois au lieu de charger chaque fichier entier.
pub fn compress_to_zip(
    source_path: &str,
    zip_dest: &str,
    mut on_progress: impl FnMut(usize, usize),
) -> Result<(), String> {
    let src = Path::new(source_path);
    if !src.exists() {
        return Err("Le fichier ou dossier source est introuvable.".to_string());
    }

    let total = count_files(src).max(1);
    let mut done = 0usize;

    let zip_file = File::create(zip_dest).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(zip_file);
    let options: FileOptions<()> =
        FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    if src.is_file() {
        let name = src
            .file_name()
            .ok_or("Nom de fichier invalide.")?
            .to_string_lossy()
            .to_string();
        zip.start_file(name, options).map_err(|e| e.to_string())?;
        let mut f = File::open(src).map_err(|e| e.to_string())?;
        std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
        on_progress(1, total);
    } else {
        let base_parent = src.parent().unwrap_or(src);
        add_dir_to_zip(&mut zip, base_parent, src, options, &mut done, total, &mut on_progress)?;
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn add_dir_to_zip(
    zip: &mut zip::ZipWriter<File>,
    base_parent: &Path,
    current: &Path,
    options: FileOptions<()>,
    done: &mut usize,
    total: usize,
    on_progress: &mut impl FnMut(usize, usize),
) -> Result<(), String> {
    for entry in std::fs::read_dir(current).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        let rel = path.strip_prefix(base_parent).unwrap_or(&path);
        let name = rel.to_string_lossy().replace('\\', "/");

        if path.is_dir() {
            zip.add_directory(format!("{name}/"), options)
                .map_err(|e| e.to_string())?;
            add_dir_to_zip(zip, base_parent, &path, options, done, total, on_progress)?;
        } else {
            zip.start_file(name, options).map_err(|e| e.to_string())?;
            let mut f = File::open(&path).map_err(|e| e.to_string())?;
            std::io::copy(&mut f, zip).map_err(|e| e.to_string())?;
            *done += 1;
            on_progress(*done, total);
        }
    }
    Ok(())
}
