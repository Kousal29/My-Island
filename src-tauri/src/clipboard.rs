use crate::state::AppState;
use serde::Serialize;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const MAX_LEN: usize = 100_000;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClipEvent {
    pub text: Option<String>,
    pub files: Vec<String>,
}

#[cfg(windows)]
mod imp {
    use windows::core::w;
    use windows::Win32::System::DataExchange::{GetClipboardSequenceNumber, IsClipboardFormatAvailable, RegisterClipboardFormatW};

    pub fn sequence() -> u32 {
        unsafe { GetClipboardSequenceNumber() }
    }

    /// Password managers mark secrets with these formats so clipboard tools skip them.
    pub fn is_sensitive() -> bool {
        unsafe {
            let exclude = RegisterClipboardFormatW(w!("ExcludeClipboardContentFromMonitorProcessing"));
            let no_history = RegisterClipboardFormatW(w!("CanIncludeInClipboardHistory"));
            let no_cloud = RegisterClipboardFormatW(w!("CanUploadToCloudClipboard"));
            IsClipboardFormatAvailable(exclude).is_ok()
                || IsClipboardFormatAvailable(no_history).is_ok()
                || IsClipboardFormatAvailable(no_cloud).is_ok()
        }
    }
}

pub fn spawn(app: AppHandle) {
    #[cfg(windows)]
    std::thread::spawn(move || {
        let mut last_seq = imp::sequence();
        let mut last_text = String::new();
        let mut cb: Option<arboard::Clipboard> = None;
        loop {
            std::thread::sleep(Duration::from_millis(450));
            let seq = imp::sequence();
            if seq == last_seq {
                continue;
            }
            last_seq = seq;
            if !app.state::<AppState>().clipboard_capture.load(Ordering::Relaxed) || imp::is_sensitive() {
                continue;
            }
            if cb.is_none() {
                cb = arboard::Clipboard::new().ok();
            }
            let Some(clip) = cb.as_mut() else { continue };

            let files = clip.get().file_list().unwrap_or_default();
            if !files.is_empty() {
                let files = files.into_iter().map(|p| p.to_string_lossy().into_owned()).collect();
                let _ = app.emit("clipboard://changed", ClipEvent { text: None, files });
                continue;
            }
            let Ok(text) = clip.get_text() else { continue };
            if text.trim().is_empty() || text == last_text {
                continue;
            }
            last_text = text.clone();
            let text = if text.len() > MAX_LEN {
                let mut end = MAX_LEN;
                while !text.is_char_boundary(end) {
                    end -= 1;
                }
                text[..end].to_string()
            } else {
                text
            };
            let _ = app.emit("clipboard://changed", ClipEvent { text: Some(text), files: vec![] });
        }
    });
    #[cfg(not(windows))]
    let _ = app;
}

#[tauri::command]
pub fn set_clipboard_capture(app: AppHandle, value: bool) {
    app.state::<AppState>().clipboard_capture.store(value, Ordering::Relaxed);
}
