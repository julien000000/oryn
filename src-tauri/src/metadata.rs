use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const SGDB_BASE: &str = "https://www.steamgriddb.com/api/v2";
const JUNK_TOKENS: &[&str] = &[
    "repack", "proper", "fitgirl", "dodi", "gog", "codex", "skidrow", "plaza", "cpy",
    "reloaded", "cracked", "crack", "unlocked", "update", "hotfix", "dlc", "multi",
    "x64", "x86", "win32", "win64", "windows", "pc", "portable", "full", "complete",
    "cpy", "rune", "empress", "online", "fix", "trainer",
];

struct IgdbTokenCache {
    access: String,
    expires_at: Instant,
}

static IGDB_TOKEN: Mutex<Option<IgdbTokenCache>> = Mutex::new(None);

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OnlineGameMatch {
    pub id: i64,
    pub name: String,
    pub verified: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OnlineCoverOption {
    pub id: i64,
    pub url: String,
    pub thumb: String,
}

#[derive(Deserialize)]
struct SgdbSearchResponse {
    success: bool,
    data: Vec<SgdbGameRaw>,
}

#[derive(Deserialize)]
struct SgdbGameRaw {
    id: i64,
    name: String,
    verified: bool,
}

#[derive(Deserialize)]
struct SgdbGridsResponse {
    success: bool,
    data: Vec<SgdbGridRaw>,
}

#[derive(Deserialize)]
struct SgdbGridRaw {
    id: i64,
    url: String,
    thumb: String,
}

/// Nettoie un nom de dossier / exe scene (repacks, ROM, tags) pour en extraire
/// un titre cherchable sur SteamGridDB / IGDB / Steam.
pub fn clean_game_title(raw: &str) -> String {
    let mut s = Path::new(raw)
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or(raw)
        .trim()
        .to_string();

    if s.matches('.').count() >= 2 && !s.contains(' ') {
        s = s.replace('.', " ");
    }
    s = s.replace(['_', '+'], " ");

    loop {
        let start = s.find('(').or_else(|| s.find('['));
        let Some(start) = start else { break };
        let closer = if s.as_bytes().get(start) == Some(&b'(') { ')' } else { ']' };
        let Some(rel_end) = s[start..].find(closer) else { break };
        s.replace_range(start..=start + rel_end, " ");
    }

    let cleaned = s
        .split_whitespace()
        .filter(|token| {
            let lower = token.to_lowercase();
            !JUNK_TOKENS.contains(&lower.as_str()) && !is_build_version(&lower)
        })
        .collect::<Vec<_>>()
        .join(" ");

    let cleaned = cleaned.trim().to_string();
    if cleaned.is_empty() {
        raw.trim().to_string()
    } else {
        cleaned
    }
}

fn is_build_version(token: &str) -> bool {
    let t = token.strip_prefix('v').unwrap_or(token);
    t.contains('.') && t.chars().all(|c| c.is_ascii_digit() || c == '.')
}

fn normalize_for_match(s: &str) -> String {
    clean_game_title(s)
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Choisit le meilleur résultat SteamGridDB / IGDB pour un titre nettoyé.
pub fn pick_best_match(matches: Vec<OnlineGameMatch>, query: &str) -> Option<OnlineGameMatch> {
    if matches.is_empty() {
        return None;
    }
    let q = normalize_for_match(query);
    if q.is_empty() {
        return matches.into_iter().next();
    }

    let mut ranked: Vec<(i32, OnlineGameMatch)> = matches
        .into_iter()
        .map(|m| {
            let n = normalize_for_match(&m.name);
            let mut score = 0;
            if n == q {
                score += 100;
            } else if n.starts_with(&q) || q.starts_with(&n) {
                score += 70;
            } else if n.contains(&q) || q.contains(&n) {
                score += 40;
            }
            if m.verified {
                score += 8;
            }
            (score, m)
        })
        .collect();

    ranked.sort_by(|a, b| b.0.cmp(&a.0));
    ranked.into_iter().next().map(|(_, m)| m)
}

/// Encodage percent minimal mais correct sur les octets UTF-8, suffisant pour
/// une requête de recherche de titre de jeu (gère les accents correctement).
fn percent_encode(s: &str) -> String {
    let mut out = String::new();
    for byte in s.as_bytes() {
        let c = *byte as char;
        if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '~') {
            out.push(c);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

/// Recherche des correspondances de jeu sur SteamGridDB. Renvoie plusieurs
/// candidats : c'est à l'utilisateur de choisir le bon dans l'interface,
/// jamais une correspondance appliquée automatiquement sans confirmation.
pub async fn search_game(api_key: &str, query: &str) -> Result<Vec<OnlineGameMatch>, String> {
    let client = reqwest::Client::new();
    let url = format!("{SGDB_BASE}/search/autocomplete/{}", percent_encode(query));

    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .send()
        .await
        .map_err(|e| format!("Erreur réseau : {e}"))?;

    if !resp.status().is_success() {
        return Err(format!(
            "SteamGridDB a répondu une erreur ({}). Vérifie ta clé API dans Paramètres.",
            resp.status()
        ));
    }

    let parsed: SgdbSearchResponse = resp.json().await.map_err(|e| e.to_string())?;
    if !parsed.success {
        return Err("Recherche échouée sur SteamGridDB.".to_string());
    }

    Ok(parsed
        .data
        .into_iter()
        .map(|g| OnlineGameMatch {
            id: g.id,
            name: g.name,
            verified: g.verified,
        })
        .collect())
}

/// Récupère les covers disponibles (format poster) pour un jeu SteamGridDB donné.
pub async fn fetch_covers(api_key: &str, sgdb_id: i64) -> Result<Vec<OnlineCoverOption>, String> {
    let client = reqwest::Client::new();
    let url = format!("{SGDB_BASE}/grids/game/{sgdb_id}?dimensions=600x900,342x482");

    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .send()
        .await
        .map_err(|e| format!("Erreur réseau : {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("SteamGridDB a répondu une erreur ({}).", resp.status()));
    }

    let parsed: SgdbGridsResponse = resp.json().await.map_err(|e| e.to_string())?;
    if !parsed.success {
        return Err("Impossible de récupérer les covers pour ce jeu.".to_string());
    }

    Ok(parsed
        .data
        .into_iter()
        .take(12)
        .map(|g| OnlineCoverOption {
            id: g.id,
            url: g.url,
            thumb: g.thumb,
        })
        .collect())
}

// ---------- SUCCÈS STEAM (API officielle Valve) ----------

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SteamAchievementDisplay {
    pub api_name: String,
    pub name: String,
    pub description: String,
    pub achieved: bool,
    pub icon: String,
}

#[derive(Deserialize)]
struct PlayerAchievementsResponse {
    playerstats: PlayerStats,
}

#[derive(Deserialize)]
struct PlayerStats {
    #[serde(default)]
    success: bool,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    achievements: Vec<PlayerAchievementRaw>,
}

#[derive(Deserialize)]
struct PlayerAchievementRaw {
    apiname: String,
    achieved: i32,
}

#[derive(Deserialize)]
struct SchemaResponse {
    game: SchemaGame,
}

#[derive(Deserialize)]
struct SchemaGame {
    #[serde(rename = "availableGameStats")]
    available_game_stats: Option<AvailableGameStats>,
}

#[derive(Deserialize)]
struct AvailableGameStats {
    #[serde(default)]
    achievements: Vec<SchemaAchievementRaw>,
}

#[derive(Deserialize)]
struct SchemaAchievementRaw {
    name: String,
    #[serde(rename = "displayName")]
    display_name: String,
    #[serde(default)]
    description: String,
    icon: String,
    icongray: String,
}

/// Récupère les vrais succès Steam d'un jeu pour le compte configuré, via
/// l'API officielle Valve (ISteamUserStats). Nécessite que le profil Steam
/// ait ses succès en visibilité publique, sinon Steam refuse la requête.
pub async fn fetch_player_achievements(
    api_key: &str,
    steam_id64: &str,
    app_id: &str,
) -> Result<Vec<SteamAchievementDisplay>, String> {
    let client = reqwest::Client::new();

    let player_url = format!(
        "https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid={app_id}&key={api_key}&steamid={steam_id64}&l=french"
    );
    let player_resp = client
        .get(&player_url)
        .send()
        .await
        .map_err(|e| format!("Erreur réseau : {e}"))?;

    if !player_resp.status().is_success() {
        return Err(
            "Steam a refusé la requête. Vérifie ta clé API et ton SteamID64, et que ton profil Steam \
             a ses succès en visibilité publique."
                .to_string(),
        );
    }

    let player_data: PlayerAchievementsResponse =
        player_resp.json().await.map_err(|e| e.to_string())?;

    if !player_data.playerstats.success {
        let msg = player_data
            .playerstats
            .error
            .unwrap_or_else(|| "Ce jeu n'a pas de succès Steam, ou le profil est privé.".to_string());
        return Err(msg);
    }

    let schema_url = format!(
        "https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?appid={app_id}&key={api_key}&l=french"
    );
    let schema_resp = client
        .get(&schema_url)
        .send()
        .await
        .map_err(|e| format!("Erreur réseau : {e}"))?;

    let schema_achievements: Vec<SchemaAchievementRaw> = if schema_resp.status().is_success() {
        schema_resp
            .json::<SchemaResponse>()
            .await
            .ok()
            .and_then(|s| s.game.available_game_stats)
            .map(|a| a.achievements)
            .unwrap_or_default()
    } else {
        vec![]
    };

    let result = player_data
        .playerstats
        .achievements
        .into_iter()
        .map(|p| {
            let schema = schema_achievements.iter().find(|s| s.name == p.apiname);
            SteamAchievementDisplay {
                api_name: p.apiname.clone(),
                name: schema.map(|s| s.display_name.clone()).unwrap_or(p.apiname.clone()),
                description: schema.map(|s| s.description.clone()).unwrap_or_default(),
                achieved: p.achieved != 0,
                icon: schema
                    .map(|s| if p.achieved != 0 { s.icon.clone() } else { s.icongray.clone() })
                    .unwrap_or_default(),
            }
        })
        .collect();

    Ok(result)
}

/// Récupère les logos transparents disponibles pour un jeu SteamGridDB donné
/// (utilisés pour le logo flottant sur la page de détails).
pub async fn fetch_logos(api_key: &str, sgdb_id: i64) -> Result<Vec<OnlineCoverOption>, String> {
    let client = reqwest::Client::new();
    let url = format!("{SGDB_BASE}/logos/game/{sgdb_id}");

    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .send()
        .await
        .map_err(|e| format!("Erreur réseau : {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("SteamGridDB a répondu une erreur ({}).", resp.status()));
    }

    let parsed: SgdbGridsResponse = resp.json().await.map_err(|e| e.to_string())?;
    if !parsed.success {
        return Err("Impossible de récupérer les logos pour ce jeu.".to_string());
    }

    Ok(parsed
        .data
        .into_iter()
        .take(12)
        .map(|g| OnlineCoverOption {
            id: g.id,
            url: g.url,
            thumb: g.thumb,
        })
        .collect())
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct GameMedia {
    pub trailer_url: Option<String>,
    pub trailer_youtube_id: Option<String>,
    pub background_url: Option<String>,
    pub description: Option<String>,
    pub genres: Vec<String>,
    pub developers: Vec<String>,
    pub publishers: Vec<String>,
    pub release_date: Option<String>,
}

#[derive(Deserialize)]
struct YoutubeSearchResponse {
    #[serde(default)]
    items: Vec<YoutubeSearchItem>,
}

#[derive(Deserialize)]
struct YoutubeSearchItem {
    id: YoutubeVideoId,
}

#[derive(Deserialize)]
struct YoutubeVideoId {
    #[serde(rename = "videoId")]
    video_id: Option<String>,
}

/// Cherche un trailer sur YouTube (complément à Steam, utilisé uniquement en
/// repli quand aucun trailer natif n'a été trouvé). Résultat "meilleur effort" :
/// on prend le premier résultat pertinent, sans garantie que ce soit
/// officiellement la source du développeur/éditeur.
pub async fn search_youtube_trailer(api_key: &str, game_name: &str) -> Result<Option<String>, String> {
    let client = reqwest::Client::new();
    let query = format!("{game_name} official trailer");
    let url = format!(
        "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q={}&key={api_key}",
        percent_encode(&query)
    );

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Erreur réseau : {e}"))?;

    if !resp.status().is_success() {
        return Ok(None);
    }

    let parsed: YoutubeSearchResponse = match resp.json().await {
        Ok(p) => p,
        Err(_) => return Ok(None),
    };

    Ok(parsed.items.first().and_then(|i| i.id.video_id.clone()))
}

#[derive(Deserialize)]
struct SteamAppData {
    #[serde(default)]
    short_description: Option<String>,
    #[serde(default)]
    background_raw: Option<String>,
    #[serde(default)]
    header_image: Option<String>,
    #[serde(default)]
    genres: Vec<SteamGenre>,
    #[serde(default)]
    developers: Vec<String>,
    #[serde(default)]
    publishers: Vec<String>,
    #[serde(default)]
    release_date: Option<SteamReleaseDate>,
    #[serde(default)]
    movies: Vec<SteamMovie>,
}

#[derive(Deserialize)]
struct SteamGenre {
    description: String,
}

#[derive(Deserialize)]
struct SteamReleaseDate {
    date: String,
}

#[derive(Deserialize)]
struct SteamMovie {
    #[serde(default)]
    mp4: Option<SteamMovieQuality>,
    #[serde(default)]
    webm: Option<SteamMovieQuality>,
}

#[derive(Deserialize)]
struct SteamMovieQuality {
    max: String,
}

#[derive(Deserialize)]
struct SteamSearchResponse {
    items: Vec<SteamSearchItem>,
}

#[derive(Deserialize)]
struct SteamSearchItem {
    id: i64,
}

/// Cherche si un jeu (même installé hors Steam) existe sur le Store Steam,
/// par son nom, pour pouvoir récupérer son trailer/background officiel.
/// Best-effort : ne sert jamais à identifier le jeu de façon définitive,
/// uniquement à emprunter ses médias publics le temps d'un affichage.
pub async fn search_steam_appid(name: &str) -> Result<Option<String>, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://store.steampowered.com/api/storesearch/?term={}&l=french&cc=FR",
        percent_encode(name)
    );

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Erreur réseau : {e}"))?;

    if !resp.status().is_success() {
        return Ok(None);
    }

    let parsed: SteamSearchResponse = match resp.json().await {
        Ok(p) => p,
        Err(_) => return Ok(None),
    };

    Ok(parsed.items.first().map(|i| i.id.to_string()))
}

/// Récupère les vraies infos publiques du Store Steam pour un jeu (trailer,
/// description, genres...) via l'API appdetails officielle, sans clé requise.
/// Ne fonctionne que pour les jeux Steam. Renvoie une structure vide (pas
/// d'erreur) si rien n'est disponible, pour un fallback propre côté frontend
/// (trailer -> background -> cover). Parsing volontairement défensif : Steam
/// renvoie parfois "data": false (jeu sans fiche store) ou des films sans
/// mp4 (uniquement webm) — on gère ces deux cas sans tout faire échouer.
pub async fn fetch_steam_media(app_id: &str) -> Result<GameMedia, String> {
    let client = reqwest::Client::new();
    let url = format!("https://store.steampowered.com/api/appdetails?appids={app_id}&l=french");

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Erreur réseau : {e}"))?;

    if !resp.status().is_success() {
        return Ok(GameMedia::default());
    }

    let body = resp.text().await.map_err(|e| e.to_string())?;
    let value: serde_json::Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;

    let Some(entry) = value.get(app_id) else {
        return Ok(GameMedia::default());
    };
    let success = entry.get("success").and_then(|s| s.as_bool()).unwrap_or(false);
    if !success {
        return Ok(GameMedia::default());
    }
    let Some(data_value) = entry.get("data") else {
        return Ok(GameMedia::default());
    };
    if !data_value.is_object() {
        // Certains jeux renvoient "data": false (pas de fiche store), pas une erreur.
        return Ok(GameMedia::default());
    }
    let data: SteamAppData = match serde_json::from_value(data_value.clone()) {
        Ok(d) => d,
        Err(_) => return Ok(GameMedia::default()),
    };

    let trailer_url = data.movies.iter().find_map(|m| {
        m.mp4
            .as_ref()
            .map(|q| q.max.clone())
            .or_else(|| m.webm.as_ref().map(|q| q.max.clone()))
    });

    Ok(GameMedia {
        trailer_url,
        trailer_youtube_id: None,
        background_url: data.background_raw.clone().or_else(|| data.header_image.clone()),
        description: data.short_description.clone(),
        genres: data.genres.iter().map(|g| g.description.clone()).collect(),
        developers: data.developers.clone(),
        publishers: data.publishers.clone(),
        release_date: data.release_date.as_ref().map(|d| d.date.clone()),
    })
}

/// Cover Steam "library" 600x900, sans clé API. Best-effort : 404 = None.
pub async fn fetch_steam_library_cover(app_id: &str) -> Result<Option<String>, String> {
    let url = format!(
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{app_id}/library_600x900.jpg"
    );
    let client = reqwest::Client::new();
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Ok(None);
    }
    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();
    if !content_type.starts_with("image/") {
        return Ok(None);
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() < 1024 {
        return Ok(None);
    }
    let encoded = STANDARD.encode(&bytes);
    Ok(Some(format!("data:{content_type};base64,{encoded}")))
}

async fn igdb_access_token(client_id: &str, client_secret: &str) -> Result<String, String> {
    {
        let cache = IGDB_TOKEN.lock().map_err(|e| e.to_string())?;
        if let Some(token) = cache.as_ref() {
            if token.expires_at > Instant::now() + Duration::from_secs(60) {
                return Ok(token.access.clone());
            }
        }
    }

    let client = reqwest::Client::new();
    let url = format!(
        "https://id.twitch.tv/oauth2/token?client_id={}&client_secret={}&grant_type=client_credentials",
        percent_encode(client_id),
        percent_encode(client_secret)
    );
    let resp = client.post(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err("IGDB / Twitch a refusé l'authentification.".to_string());
    }
    let value: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let access = value
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("Token IGDB manquant.")?
        .to_string();
    let expires_in = value.get("expires_in").and_then(|v| v.as_u64()).unwrap_or(3600);

    if let Ok(mut cache) = IGDB_TOKEN.lock() {
        *cache = Some(IgdbTokenCache {
            access: access.clone(),
            expires_at: Instant::now() + Duration::from_secs(expires_in.saturating_sub(120)),
        });
    }
    Ok(access)
}

/// Cherche un trailer YouTube via IGDB (jeux rétro / hors Steam compris).
/// Ne plante jamais : None si pas de clé, erreur réseau, ou pas de vidéo.
pub async fn search_igdb_trailer(
    client_id: &str,
    client_secret: &str,
    game_name: &str,
) -> Option<String> {
    let token = igdb_access_token(client_id, client_secret).await.ok()?;
    let query = clean_game_title(game_name);
    if query.is_empty() {
        return None;
    }

    let body = format!(
        "search \"{}\"; fields name, videos.video_id; limit 8;",
        query.replace('\\', "").replace('"', "")
    );

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.igdb.com/v4/games")
        .header("Client-ID", client_id)
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/json")
        .body(body)
        .send()
        .await
        .ok()?;

    if !resp.status().is_success() {
        return None;
    }

    let value: serde_json::Value = resp.json().await.ok()?;
    let games = value.as_array()?;
    let query_norm = normalize_for_match(&query);

    let mut best: Option<(i32, String)> = None;
    for game in games {
        let name = game.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let Some(video_id) = game.get("videos").and_then(|v| v.as_array()).and_then(|videos| {
            videos
                .iter()
                .find_map(|video| video.get("video_id").and_then(|id| id.as_str()).map(|s| s.to_string()))
        }) else {
            continue;
        };
        let n = normalize_for_match(name);
        let mut score = 1;
        if n == query_norm {
            score = 100;
        } else if n.starts_with(&query_norm) || query_norm.starts_with(&n) {
            score = 70;
        } else if n.contains(&query_norm) || query_norm.contains(&n) {
            score = 40;
        }
        if best.as_ref().map(|(s, _)| score > *s).unwrap_or(true) {
            best = Some((score, video_id));
        }
    }
    best.map(|(_, id)| id)
}

/// dans le frontend comme n'importe quelle cover locale.
pub async fn download_image_as_data_url(url: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err("Téléchargement de l'image échoué.".to_string());
    }

    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png")
        .to_string();

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    let encoded = STANDARD.encode(&bytes);
    Ok(format!("data:{content_type};base64,{encoded}"))
}
