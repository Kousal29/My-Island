//! Detects calls/meetings by watching which apps are using the microphone or camera, via the
//! same registry data Windows uses for its privacy indicator (no audio is ever accessed).

use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone, PartialEq, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CallState {
    pub active: bool,
    /// Friendly app name using the mic/camera.
    pub app: String,
    /// True for known meeting apps (Teams, Zoom, Meet in a browser…).
    pub meeting: bool,
    pub mic: bool,
    pub camera: bool,
    /// Unix ms when the mic/camera started being used.
    pub since: f64,
}

#[cfg(windows)]
mod imp {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    const ROOT: &str = r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore";
    /// 100ns ticks between 1601-01-01 and 1970-01-01.
    const EPOCH_DIFF: u64 = 116_444_736_000_000_000;

    fn in_use(key: &RegKey) -> Option<u64> {
        let stop: u64 = key.get_value("LastUsedTimeStop").ok()?;
        let start: u64 = key.get_value("LastUsedTimeStart").ok()?;
        (stop == 0 && start > 0).then_some(start)
    }

    fn friendly(raw: &str) -> String {
        let tail = raw.rsplit('#').next().unwrap_or(raw);
        let base = tail.split('_').next().unwrap_or(tail).trim_end_matches(".exe").trim_end_matches(".EXE");
        let l = base.to_lowercase();
        let name = if l.contains("teams") {
            "Teams"
        } else if l.contains("zoom") {
            "Zoom"
        } else if l.contains("slack") {
            "Slack"
        } else if l.contains("discord") {
            "Discord"
        } else if l.contains("skype") {
            "Skype"
        } else if l.contains("webex") {
            "Webex"
        } else if l.contains("chrome") {
            "Chrome"
        } else if l.contains("msedge") {
            "Edge"
        } else if l.contains("firefox") {
            "Firefox"
        } else {
            return base.to_string();
        };
        name.to_string()
    }

    pub fn is_meeting(app: &str) -> bool {
        matches!(app, "Teams" | "Zoom" | "Slack" | "Discord" | "Skype" | "Webex" | "Chrome" | "Edge" | "Firefox")
    }

    /// (friendly app, start unix-ms) of apps currently using `capability`.
    pub fn users(capability: &str) -> Vec<(String, f64)> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let Ok(root) = hkcu.open_subkey(format!(r"{ROOT}\{capability}")) else { return vec![] };
        let mut out = Vec::new();
        let mut check = |name: &str, key: RegKey| {
            if let Some(start) = in_use(&key) {
                let ms = start.saturating_sub(EPOCH_DIFF) as f64 / 10_000.0;
                out.push((friendly(name), ms));
            }
        };
        for sub in root.enum_keys().flatten() {
            if sub == "NonPackaged" {
                if let Ok(np) = root.open_subkey(&sub) {
                    for app in np.enum_keys().flatten() {
                        if let Ok(k) = np.open_subkey(&app) {
                            check(&app, k);
                        }
                    }
                }
            } else if let Ok(k) = root.open_subkey(&sub) {
                check(&sub, k);
            }
        }
        out
    }
}

pub fn spawn(app: AppHandle) {
    #[cfg(windows)]
    std::thread::spawn(move || {
        let mut last = CallState::default();
        loop {
            std::thread::sleep(Duration::from_millis(2000));
            let mics = imp::users("microphone");
            let cams = imp::users("webcam");
            // Prefer a known meeting app; otherwise whatever is using the mic/camera.
            let pick = mics.iter().chain(cams.iter()).max_by_key(|(a, _)| imp::is_meeting(a)).cloned();
            let next = match pick {
                Some((name, since)) => CallState {
                    active: true,
                    meeting: imp::is_meeting(&name),
                    mic: mics.iter().any(|(a, _)| *a == name),
                    camera: cams.iter().any(|(a, _)| *a == name),
                    since: mics.iter().chain(cams.iter()).filter(|(a, _)| *a == name).map(|(_, s)| *s).fold(since, f64::min),
                    app: name,
                },
                None => CallState::default(),
            };
            if next != last {
                let _ = app.emit_to("main", "call://state", &next);
                last = next;
            }
        }
    });
    #[cfg(not(windows))]
    let _ = app;
}
