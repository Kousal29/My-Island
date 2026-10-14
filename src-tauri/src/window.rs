use crate::state::{AppState, Geometry};
use serde::Serialize;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewWindow};

pub const WIN_W: f64 = 760.0;
pub const WIN_H: f64 = 500.0;
pub const COMPACT_W: f64 = 440.0;
pub const COMPACT_H: f64 = 76.0;

#[derive(Serialize)]
pub struct MonitorInfo {
    pub index: usize,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub scale: f64,
    pub primary: bool,
}

pub fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

fn pick_monitor(win: &WebviewWindow, index: i32) -> Option<Monitor> {
    let monitors = win.available_monitors().ok()?;
    if index >= 0 {
        if let Some(m) = monitors.get(index as usize) {
            return Some(m.clone());
        }
    }
    win.primary_monitor().ok().flatten().or_else(|| monitors.into_iter().next())
}

/// Places the window at the top-center of the chosen monitor, sized in that monitor's DPI.
pub fn reposition(app: &AppHandle) {
    let Some(win) = main_window(app) else { return };
    let state = app.state::<AppState>();
    let Some(mon) = pick_monitor(&win, state.monitor_index.load(Ordering::Relaxed)) else { return };
    let scale = mon.scale_factor();
    let (lw, lh) = if state.compact.load(Ordering::Relaxed) { (COMPACT_W, COMPACT_H) } else { (WIN_W, WIN_H) };
    let w = (lw * scale).round() as u32;
    let h = (lh * scale).round() as u32;
    let x = mon.position().x + (mon.size().width as i32 - w as i32) / 2;
    let y = mon.position().y;
    let _ = win.set_position(PhysicalPosition::new(x, y));
    let _ = win.set_size(PhysicalSize::new(w, h));
    // A DPI change during the move can resize the window; re-apply position with the final size.
    let _ = win.set_position(PhysicalPosition::new(x, y));
    state.set_geometry("main", Geometry { x, y, scale });
}

pub fn refresh_geometry(win: &tauri::Window) {
    if let (Ok(pos), Ok(scale)) = (win.outer_position(), win.scale_factor()) {
        win.app_handle().state::<AppState>().set_geometry(win.label(), Geometry { x: pos.x, y: pos.y, scale });
    }
}

#[cfg(windows)]
pub fn show_no_activate(win: &WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWNOACTIVATE};
    if let Ok(h) = win.hwnd() {
        unsafe {
            let _ = ShowWindow(HWND(h.0 as _), SW_SHOWNOACTIVATE);
        }
    }
}

#[cfg(not(windows))]
pub fn show_no_activate(win: &WebviewWindow) {
    let _ = win.show();
}

/// Hide a window from screen capture / sharing (Teams, Zoom, OBS) while keeping it visible.
#[cfg(windows)]
pub fn apply_capture_privacy(win: &WebviewWindow, hidden: bool) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE};
    if let Ok(h) = win.hwnd() {
        unsafe {
            let _ = SetWindowDisplayAffinity(HWND(h.0 as _), if hidden { WDA_EXCLUDEFROMCAPTURE } else { WDA_NONE });
        }
    }
}

#[cfg(not(windows))]
pub fn apply_capture_privacy(_: &WebviewWindow, _: bool) {}

#[tauri::command]
pub fn set_capture_privacy(app: AppHandle, pet: bool, island: bool) {
    let state = app.state::<AppState>();
    state.pet_capture_hidden.store(pet, Ordering::Relaxed);
    state.island_capture_hidden.store(island, Ordering::Relaxed);
    if let Some(w) = main_window(&app) {
        apply_capture_privacy(&w, island);
    }
    if let Some(w) = app.get_webview_window(crate::buddy::LABEL) {
        apply_capture_privacy(&w, pet);
    }
}

/// Seconds since the last keyboard/mouse input (for pausing reminders while away).
#[tauri::command]
pub fn idle_seconds() -> u32 {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::System::SystemInformation::GetTickCount;
        use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
        let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
        if GetLastInputInfo(&mut info).as_bool() {
            return GetTickCount().wrapping_sub(info.dwTime) / 1000;
        }
    }
    0
}

#[tauri::command]
pub fn list_monitors(app: AppHandle) -> Vec<MonitorInfo> {
    let Some(win) = main_window(&app) else { return vec![] };
    let primary = win.primary_monitor().ok().flatten().map(|m| *m.position());
    win.available_monitors()
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .map(|(index, m)| MonitorInfo {
            index,
            name: m.name().cloned().unwrap_or_else(|| format!("Display {}", index + 1)),
            width: m.size().width,
            height: m.size().height,
            scale: m.scale_factor(),
            primary: primary == Some(*m.position()),
        })
        .collect()
}

#[tauri::command]
pub fn set_monitor(app: AppHandle, index: i32) {
    app.state::<AppState>().monitor_index.store(index, Ordering::Relaxed);
    reposition(&app);
}

#[tauri::command]
pub fn set_compact(app: AppHandle, value: bool) {
    if app.state::<AppState>().compact.swap(value, Ordering::Relaxed) != value {
        reposition(&app);
    }
}

/// The island animates itself away for fullscreen apps; here we only make sure the window
/// can't catch the mouse. It's never hidden: Tauri would later re-apply a stale visibility
/// state when click-through toggles, and showing it again could steal focus.
#[tauri::command]
pub fn set_visible(app: AppHandle, visible: bool) {
    if let Some(win) = main_window(&app) {
        if !visible {
            let _ = win.set_ignore_cursor_events(true);
        }
        app.state::<AppState>().targets.lock().unwrap().entry("main".into()).or_default().rect = None;
    }
}

#[tauri::command]
pub fn focus_island(app: AppHandle) {
    if let Some(win) = main_window(&app) {
        let _ = win.set_ignore_cursor_events(false);
        let _ = win.set_focus();
    }
}
