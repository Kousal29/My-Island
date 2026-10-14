use serde::Serialize;
use std::path::Path;
use std::time::UNIX_EPOCH;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMeta {
    pub path: String,
    pub name: String,
    pub ext: String,
    pub is_dir: bool,
    pub size: u64,
    pub exists: bool,
    pub modified: Option<u64>,
}

#[tauri::command(async)]
pub fn file_meta(paths: Vec<String>) -> Vec<FileMeta> {
    paths
        .into_iter()
        .map(|path| {
            let p = Path::new(&path);
            let md = std::fs::metadata(p).ok();
            FileMeta {
                name: p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.clone()),
                ext: p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default(),
                is_dir: md.as_ref().map_or(false, |m| m.is_dir()),
                size: md.as_ref().map_or(0, |m| if m.is_dir() { 0 } else { m.len() }),
                exists: md.is_some(),
                modified: md
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64),
                path,
            }
        })
        .collect()
}

#[tauri::command]
pub fn open_path(app: AppHandle, path: String) -> Result<(), String> {
    app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reveal_path(app: AppHandle, path: String) -> Result<(), String> {
    app.opener().reveal_item_in_dir(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    let allowed = url.starts_with("http://") || url.starts_with("https://") || url.starts_with("mailto:") || url.starts_with("ms-settings:");
    if !allowed {
        return Err("unsupported url".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}
