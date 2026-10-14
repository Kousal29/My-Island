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

#[tauri::command]
pub fn set_visible(app: AppHandle, visible: bool) {
    if let Some(win) = main_window(&app) {
        if visible {
            show_no_activate(&win);
        } else {
            let _ = win.hide();
        }
    }
}

#[tauri::command]
pub fn focus_island(app: AppHandle) {
    if let Some(win) = main_window(&app) {
        let _ = win.set_ignore_cursor_events(false);
        let _ = win.set_focus();
    }
}
