//! Mirrors Windows toast notifications into the island (Teams, Outlook, Slack, browsers…).
//! Uses the UserNotificationListener API, which needs "Notification access" enabled in
//! Windows Settings → Privacy & security → Notifications.

use crate::state::AppState;
use serde::Serialize;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Toast {
    pub id: u32,
    pub app: String,
    pub app_id: String,
    pub title: String,
    pub body: String,
    pub icon: Option<String>,
    /// "call" for incoming calls, otherwise "message".
    pub kind: &'static str,
    pub at: f64,
}

#[cfg(windows)]
mod imp {
    use super::*;
    use base64::Engine;
    use std::collections::{HashMap, HashSet};
    use std::time::{Duration, SystemTime, UNIX_EPOCH};
    use windows::core::Result;
    use windows::Foundation::Size;
    use windows::Storage::Streams::DataReader;
    use windows::UI::Notifications::Management::{UserNotificationListener, UserNotificationListenerAccessStatus};
    use windows::UI::Notifications::{KnownNotificationBindings, NotificationKinds, UserNotification};

    fn now_ms() -> f64 {
        SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0)
    }

    fn logo(n: &UserNotification) -> Option<String> {
        let info = n.AppInfo().ok()?.DisplayInfo().ok()?;
        let stream = info.GetLogo(Size { Width: 48.0, Height: 48.0 }).ok()?.OpenReadAsync().ok()?.get().ok()?;
        let size = stream.Size().ok()? as u32;
        if size == 0 || size > 2_000_000 {
            return None;
        }
        let reader = DataReader::CreateDataReader(&stream).ok()?;
        reader.LoadAsync(size).ok()?.get().ok()?;
        let mut buf = vec![0u8; size as usize];
        reader.ReadBytes(&mut buf).ok()?;
        Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(buf)))
    }

    fn read(n: &UserNotification, icons: &mut HashMap<String, Option<String>>) -> Result<Toast> {
        let info = n.AppInfo()?;
        let app = info.DisplayInfo().and_then(|d| d.DisplayName()).map(|s| s.to_string()).unwrap_or_default();
        let app_id = info.AppUserModelId().map(|s| s.to_string()).unwrap_or_default();
        let binding = n.Notification()?.Visual()?.GetBinding(&KnownNotificationBindings::ToastGeneric()?)?;
        let elems = binding.GetTextElements()?;
        let mut texts = Vec::new();
        for i in 0..elems.Size()? {
            let t = elems.GetAt(i)?.Text()?.to_string();
            if !t.trim().is_empty() {
                texts.push(t);
            }
        }
        let title = texts.first().cloned().unwrap_or_else(|| app.clone());
        let body = texts.iter().skip(1).cloned().collect::<Vec<_>>().join("\n");
        let hay = format!("{title} {body}").to_lowercase();
        let callish = hay.contains("incoming call") || hay.contains("is calling") || hay.contains("calling you") || hay.contains("incoming video call");
        let icon = icons.entry(app_id.clone()).or_insert_with(|| logo(n)).clone();
        Ok(Toast { id: n.Id()?, app, app_id, title, body, icon, kind: if callish { "call" } else { "message" }, at: now_ms() })
    }

    pub fn run(app: AppHandle) {
        let _ = unsafe { windows::Win32::System::Com::CoInitializeEx(None, windows::Win32::System::Com::COINIT_MULTITHREADED) };
        let listener = match UserNotificationListener::Current() {
            Ok(l) => l,
            Err(_) => return set_status(&app, "unavailable"),
        };
        // Desktop apps get the status from Windows Settings (no prompt); poll until allowed.
        loop {
            let status = listener.RequestAccessAsync().and_then(|op| op.get()).or_else(|_| listener.GetAccessStatus());
            match status {
                Ok(s) if s == UserNotificationListenerAccessStatus::Allowed => break,
                Ok(_) => set_status(&app, "denied"),
                Err(_) => set_status(&app, "unavailable"),
            }
            std::thread::sleep(Duration::from_secs(15));
        }
        set_status(&app, "allowed");

        let mut seen: HashSet<u32> = HashSet::new();
        let mut icons: HashMap<String, Option<String>> = HashMap::new();
        let mut first = true;
        loop {
            std::thread::sleep(Duration::from_millis(1200));
            if !app.state::<AppState>().notify_enabled.load(Ordering::Relaxed) {
                first = true;
                continue;
            }
            let Ok(list) = listener.GetNotificationsAsync(NotificationKinds::Toast).and_then(|op| op.get()) else { continue };
            let mut current = HashSet::new();
            for i in 0..list.Size().unwrap_or(0) {
                let Ok(n) = list.GetAt(i) else { continue };
                let Ok(id) = n.Id() else { continue };
                current.insert(id);
                if seen.insert(id) && !first {
                    if let Ok(t) = read(&n, &mut icons) {
                        if t.app != "My Island" {
                            let _ = app.emit_to("main", "notify://toast", t);
                        }
                    }
                }
            }
            seen.retain(|id| current.contains(id));
            first = false;
        }
    }
}

fn set_status(app: &AppHandle, s: &'static str) {
    let state = app.state::<AppState>();
    let mut cur = state.notify_status.lock().unwrap();
    if *cur != s {
        *cur = s;
        let _ = app.emit_to("main", "notify://status", s);
    }
}

pub fn spawn(app: AppHandle) {
    #[cfg(windows)]
    std::thread::spawn(move || imp::run(app));
    #[cfg(not(windows))]
    set_status(&app, "unavailable");
}

#[tauri::command]
pub fn notify_status(app: AppHandle) -> &'static str {
    *app.state::<AppState>().notify_status.lock().unwrap()
}

#[tauri::command]
pub fn set_notify_enabled(app: AppHandle, value: bool) {
    app.state::<AppState>().notify_enabled.store(value, Ordering::Relaxed);
}
