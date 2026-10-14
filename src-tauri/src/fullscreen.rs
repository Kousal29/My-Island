//! Hides the island (and the desktop pet) while a fullscreen app, game or presentation runs.

use crate::state::AppState;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(windows)]
mod imp {
    use super::*;
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows::Win32::UI::Shell::{SHQueryUserNotificationState, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN};
    use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow, GetWindowRect};

    fn class_of(h: HWND) -> String {
        let mut buf = [0u16; 64];
        let n = unsafe { GetClassNameW(h, &mut buf) };
        String::from_utf16_lossy(&buf[..n.max(0) as usize])
    }

    fn is_shell(class: &str) -> bool {
        matches!(class, "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd")
    }

    pub struct Probe {
        pub ours: HWND,
        pub monitor: RECT,
    }

    pub fn probe(app: &AppHandle) -> Option<Probe> {
        let win = crate::window::main_window(app)?;
        let ours = HWND(win.hwnd().ok()?.0 as _);
        unsafe {
            let mon = MonitorFromWindow(ours, MONITOR_DEFAULTTONEAREST);
            let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
            if !GetMonitorInfoW(mon, &mut info).as_bool() {
                return None;
            }
            Some(Probe { ours, monitor: info.rcMonitor })
        }
    }

    pub fn fullscreen(p: &Probe) -> bool {
        unsafe {
            if let Ok(s) = SHQueryUserNotificationState() {
                if s == QUNS_RUNNING_D3D_FULL_SCREEN || s == QUNS_PRESENTATION_MODE {
                    return true;
                }
            }
            let fg = GetForegroundWindow();
            if fg.is_invalid() || fg == p.ours || is_shell(&class_of(fg)) {
                return false;
            }
            let mon = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
            if mon != MonitorFromWindow(p.ours, MONITOR_DEFAULTTONEAREST) {
                return false;
            }
            let mut r = RECT::default();
            if GetWindowRect(fg, &mut r).is_err() {
                return false;
            }
            let m = p.monitor;
            r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom
        }
    }
}

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last = false;
        loop {
            std::thread::sleep(Duration::from_millis(900));
            #[cfg(windows)]
            {
                let enabled = app.state::<AppState>().autohide_fullscreen.load(Ordering::Relaxed);
                let fs = enabled && imp::probe(&app).is_some_and(|p| imp::fullscreen(&p));
                if fs != last {
                    last = fs;
                    crate::buddy::set_fullscreen_hidden(&app, fs);
                    let _ = app.emit("island://fullscreen", fs);
                }
            }
        }
    });
}

#[tauri::command]
pub fn set_autohide_fullscreen(app: AppHandle, value: bool) {
    app.state::<AppState>().autohide_fullscreen.store(value, Ordering::Relaxed);
}
