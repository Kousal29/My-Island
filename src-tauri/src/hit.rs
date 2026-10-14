//! Overlay windows are transparent and mostly empty. Win32 has no per-pixel hit testing for
//! a WebView, so we poll the cursor and only accept mouse input while it is over the
//! interactive rect each window reports (the island, the desktop buddy).

use crate::state::{AppState, HitRect};
use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

const PAD: f64 = 3.0;

#[cfg(windows)]
pub fn cursor_pos() -> Option<(i32, i32)> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let mut p = POINT::default();
    unsafe { GetCursorPos(&mut p).ok()? };
    Some((p.x, p.y))
}

#[cfg(not(windows))]
pub fn cursor_pos() -> Option<(i32, i32)> {
    None
}

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        let mut interactive: HashMap<String, bool> = HashMap::new();
        let mut hovering: HashMap<String, bool> = HashMap::new();
        loop {
            let state = app.state::<AppState>();
            let targets = state.targets.lock().unwrap().clone();
            let cursor = cursor_pos();
            let mut any_hover = false;
            for (label, t) in targets {
                let inside = match (t.rect, cursor) {
                    (Some(r), Some((cx, cy))) => contains(r, t.geo.x, t.geo.y, t.geo.scale, cx, cy, label == "main"),
                    _ => false,
                };
                any_hover |= inside;
                let force = label == "main" && state.force_interactive.load(Ordering::Relaxed);
                let want = inside || force;
                if interactive.get(&label) != Some(&want) {
                    if let Some(win) = app.get_webview_window(&label) {
                        let _ = win.set_ignore_cursor_events(!want);
                    }
                    interactive.insert(label.clone(), want);
                }
                if hovering.get(&label).copied().unwrap_or(false) != inside {
                    hovering.insert(label.clone(), inside);
                    let _ = app.emit_to(label.as_str(), "island://hover", inside);
                }
            }
            std::thread::sleep(Duration::from_millis(if any_hover { 16 } else { 40 }));
        }
    });
}

fn contains(r: HitRect, wx: i32, wy: i32, scale: f64, cx: i32, cy: i32, top_edge: bool) -> bool {
    if r.w <= 0.0 || r.h <= 0.0 {
        return false;
    }
    let left = wx as f64 + (r.x - PAD) * scale;
    let mut top = wy as f64 + (r.y - PAD).max(0.0) * scale;
    let right = wx as f64 + (r.x + r.w + PAD) * scale;
    let bottom = wy as f64 + (r.y + r.h + PAD) * scale;
    // Include the very top screen row so flinging the mouse to the top edge still hits the island.
    if top_edge && r.y <= 12.0 {
        top = top.min(wy as f64);
    }
    let (cx, cy) = (cx as f64, cy as f64);
    cx >= left && cx < right && cy >= top && cy < bottom
}

#[tauri::command]
pub fn set_hit_rect(window: WebviewWindow, rect: Option<HitRect>) {
    let app = window.app_handle();
    let state = app.state::<AppState>();
    let mut targets = state.targets.lock().unwrap();
    let t = targets.entry(window.label().to_string()).or_default();
    t.rect = rect;
    if t.geo.scale == 0.0 {
        if let (Ok(pos), Ok(scale)) = (window.outer_position(), window.scale_factor()) {
            t.geo = crate::state::Geometry { x: pos.x, y: pos.y, scale };
        }
    }
}

#[tauri::command]
pub fn set_force_interactive(app: AppHandle, value: bool) {
    app.state::<AppState>().force_interactive.store(value, Ordering::Relaxed);
}
