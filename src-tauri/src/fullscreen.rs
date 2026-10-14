use crate::state::AppState;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(windows)]
fn foreground_is_fullscreen(app: &AppHandle) -> bool {
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows::Win32::UI::Shell::{SHQueryUserNotificationState, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN};
    use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow, GetWindowRect};

    let Some(win) = crate::window::main_window(app) else { return false };
    let Ok(ours) = win.hwnd() else { return false };
    let ours = HWND(ours.0 as _);

    unsafe {
        if let Ok(s) = SHQueryUserNotificationState() {
            if s == QUNS_RUNNING_D3D_FULL_SCREEN || s == QUNS_PRESENTATION_MODE {
                return true;
            }
        }
        let fg = GetForegroundWindow();
        if fg.is_invalid() || fg == ours {
            return false;
        }
        let mut buf = [0u16; 64];
        let n = GetClassNameW(fg, &mut buf);
        let class = String::from_utf16_lossy(&buf[..n.max(0) as usize]);
        if matches!(class.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd") {
            return false;
        }
        let fg_mon = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
        if fg_mon != MonitorFromWindow(ours, MONITOR_DEFAULTTONEAREST) {
            return false;
        }
        let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        if !GetMonitorInfoW(fg_mon, &mut info).as_bool() {
            return false;
        }
        let mut r = RECT::default();
        if GetWindowRect(fg, &mut r).is_err() {
            return false;
        }
        let m = info.rcMonitor;
        r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom
    }
}

#[cfg(not(windows))]
fn foreground_is_fullscreen(_: &AppHandle) -> bool {
    false
}

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last = false;
        loop {
            std::thread::sleep(Duration::from_millis(900));
            let enabled = app.state::<AppState>().autohide_fullscreen.load(Ordering::Relaxed);
            let now = enabled && foreground_is_fullscreen(&app);
            if now != last {
                last = now;
                if let Some(b) = app.get_webview_window(crate::buddy::LABEL) {
                    if now {
                        let _ = b.hide();
                    } else {
                        crate::window::show_no_activate(&b);
                    }
                }
                let _ = app.emit("island://fullscreen", now);
            }
        }
    });
}

#[tauri::command]
pub fn set_autohide_fullscreen(app: AppHandle, value: bool) {
    app.state::<AppState>().autohide_fullscreen.store(value, Ordering::Relaxed);
}
