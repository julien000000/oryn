use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

/// Installe deux entrées de menu contextuel Windows, à l'échelle de
/// l'utilisateur uniquement (HKEY_CURRENT_USER, pas besoin de droits admin) :
/// - clic droit sur un .exe -> "Ajouter à Nyro"
/// - clic droit sur un dossier -> "Ouvrir avec Nyro"
pub fn install_context_menu() -> Result<(), String> {
    let exe_path = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string();

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    // Clic droit sur un .exe
    let (exe_key, _) = hkcu
        .create_subkey(r"Software\Classes\exefile\shell\NyroAddGame")
        .map_err(|e| e.to_string())?;
    exe_key
        .set_value("", &"Ajouter à Nyro")
        .map_err(|e| e.to_string())?;
    if let Ok(icon_key) = exe_key.create_subkey("") {
        let _ = icon_key.0.set_value("Icon", &exe_path);
    }
    let (exe_cmd_key, _) = exe_key.create_subkey("command").map_err(|e| e.to_string())?;
    exe_cmd_key
        .set_value("", &format!("\"{exe_path}\" --add-game \"%1\""))
        .map_err(|e| e.to_string())?;

    // Clic droit sur un dossier
    let (dir_key, _) = hkcu
        .create_subkey(r"Software\Classes\Directory\shell\NyroOpen")
        .map_err(|e| e.to_string())?;
    dir_key
        .set_value("", &"Ouvrir avec Nyro")
        .map_err(|e| e.to_string())?;
    let (dir_cmd_key, _) = dir_key.create_subkey("command").map_err(|e| e.to_string())?;
    dir_cmd_key
        .set_value("", &format!("\"{exe_path}\" --open-folder \"%1\""))
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn remove_context_menu() -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let _ = hkcu.delete_subkey_all(r"Software\Classes\exefile\shell\NyroAddGame");
    let _ = hkcu.delete_subkey_all(r"Software\Classes\Directory\shell\NyroOpen");
    Ok(())
}

pub fn is_context_menu_installed() -> bool {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    hkcu.open_subkey(r"Software\Classes\exefile\shell\NyroAddGame").is_ok()
}
