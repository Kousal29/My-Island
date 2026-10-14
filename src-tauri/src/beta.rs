//! Time-limited test ("beta") builds for sharing with friends.
//!
//! Build with an expiry date (and optionally a remote off-switch):
//!   $env:MY_ISLAND_BETA_EXPIRES = "2026-11-30"
//!   $env:MY_ISLAND_BETA_URL     = "https://raw.githubusercontent.com/<you>/<repo>/main/beta.json"
//!   npm run tauri build
//!
//! - After the expiry date the app shows a message and quits. The date is compiled into the
//!   binary, so reinstalling doesn't help.
//! - The latest date the app has seen is kept in the registry (survives uninstall), so turning
//!   the PC clock back doesn't revive an expired build.
//! - If BETA_URL is set, `{"enabled": false, "message": "..."}` there ends the test early.
//!   Offline? The expiry date still applies.
//!
//! Normal builds (no env vars) are unaffected.

use serde::Serialize;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

const EXPIRES: Option<&str> = option_env!("MY_ISLAND_BETA_EXPIRES");
const KILL_URL: Option<&str> = option_env!("MY_ISLAND_BETA_URL");
const FEEDBACK_URL: Option<&str> = option_env!("MY_ISLAND_FEEDBACK_URL");
const DAY: u64 = 86_400;

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// "YYYY-MM-DD" → unix seconds at the *end* of that day (UTC).
fn parse_date(s: &str) -> Option<u64> {
    let mut it = s.trim().split('-').map(|p| p.parse::<i64>().ok());
    let (y, m, d) = (it.next()??, it.next()??, it.next()??);
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    // Days from civil (Howard Hinnant).
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    Some((days as u64 + 1) * DAY)
}

#[cfg(windows)]
mod store {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    const KEY: &str = r"Software\MyIsland\Beta";
    pub fn last_seen() -> u64 {
        RegKey::predef(HKEY_CURRENT_USER).open_subkey(KEY).and_then(|k| k.get_value::<u64, _>("LastSeen")).unwrap_or(0)
    }
    pub fn set_last_seen(v: u64) {
        if let Ok((k, _)) = RegKey::predef(HKEY_CURRENT_USER).create_subkey(KEY) {
            let _ = k.set_value("LastSeen", &v);
        }
    }
}

#[cfg(not(windows))]
mod store {
    pub fn last_seen() -> u64 {
        0
    }
    pub fn set_last_seen(_: u64) {}
}

/// Why the build can't run anymore, if it can't.
fn expired_reason() -> Option<String> {
    let exp = parse_date(EXPIRES?)?;
    let (now, last) = (now(), store::last_seen());
    if now + DAY < last {
        return Some("Your system clock seems to have moved backwards, so this test build can't verify its trial period.".into());
    }
    let effective = now.max(last);
    store::set_last_seen(effective);
    (effective > exp).then(|| format!("This test build of My Island ended on {}.\n\nThanks so much for trying it and sharing feedback!", EXPIRES.unwrap_or("")))
}

#[cfg(windows)]
fn notify_and_exit(app: &AppHandle, msg: &str) {
    use windows::core::HSTRING;
    use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONINFORMATION, MB_OK, MB_SETFOREGROUND, MB_TOPMOST};
    unsafe {
        MessageBoxW(None, &HSTRING::from(msg), &HSTRING::from("My Island"), MB_OK | MB_ICONINFORMATION | MB_TOPMOST | MB_SETFOREGROUND);
    }
    app.exit(0);
    std::process::exit(0);
}

#[cfg(not(windows))]
fn notify_and_exit(app: &AppHandle, msg: &str) {
    eprintln!("{msg}");
    app.exit(0);
    std::process::exit(0);
}

/// Runs at startup: blocks expired builds and keeps an eye on the remote off-switch.
pub fn enforce(app: &AppHandle) {
    if let Some(reason) = expired_reason() {
        notify_and_exit(app, &reason);
    }
    let Some(url) = KILL_URL else { return };
    let app = app.clone();
    std::thread::spawn(move || loop {
        let check = ureq::get(url).timeout(Duration::from_secs(6)).call().ok().and_then(|r| r.into_string().ok());
        if let Some(v) = check.and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok()) {
            if v.get("enabled").and_then(|e| e.as_bool()) == Some(false) {
                let msg = v.get("message").and_then(|m| m.as_str()).unwrap_or("This test of My Island has ended. Thanks for trying it!");
                notify_and_exit(&app, msg);
            }
        }
        // Re-check the date too, for people who leave the app running for days.
        if let Some(reason) = expired_reason() {
            notify_and_exit(&app, &reason);
        }
        std::thread::sleep(Duration::from_secs(6 * 3600));
    });
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BetaInfo {
    pub beta: bool,
    pub expires: Option<String>,
    pub days_left: Option<i64>,
    pub feedback_url: Option<String>,
}

#[tauri::command]
pub fn beta_info() -> BetaInfo {
    let exp = EXPIRES.and_then(parse_date);
    BetaInfo {
        beta: exp.is_some(),
        expires: EXPIRES.map(str::to_string),
        days_left: exp.map(|e| ((e as i64) - (now() as i64)).div_euclid(DAY as i64)),
        feedback_url: FEEDBACK_URL.map(str::to_string),
    }
}
