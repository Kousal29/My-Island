//! The desktop buddy: a tiny transparent window the pet lives in when it leaves the island.
//! The frontend drives behaviour (walk/fall/sleep); Rust owns window placement and
//! native drag so tossing the pet feels physical.

use crate::state::{AppState, BuddyEnv, Geometry};
use serde::Serialize;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const LABEL: &str = "buddy";
pub const W: f64 = 150.0;
pub const H: f64 = 150.0;

/// Must match `additionalBrowserArgs` of the main window in tauri.conf.json: WebView2 windows
/// only share one browser process (and memory) when their environment options are identical.
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,Translate,AutofillServerCommunication,MediaRouter --disable-background-networking --disable-component-update --disable-extensions --disable-sync --disable-default-apps --no-first-run --js-flags=--max-old-space-size=96 --renderer-process-limit=1";

fn compute_env(app: &AppHandle) -> Option<BuddyEnv> {
    let main = crate::window::main_window(app)?;
    let mon = main.current_monitor().ok().flatten().or_else(|| main.primary_monitor().ok().flatten())?;
    let s = mon.scale_factor();
    let (mx, my) = (mon.position().x, mon.position().y);
    let wa = mon.work_area();
    let main_pos = main.outer_position().ok()?;
    let main_w = main.outer_size().ok()?.width as f64;
    Some(BuddyEnv {
        mon_x: mx,
        mon_y: my,
        scale: s,
        work_left: (wa.position.x - mx) as f64 / s,
        work_top: (wa.position.y - my) as f64 / s,
        work_right: (wa.position.x - mx + wa.size.width as i32) as f64 / s,
        work_bottom: (wa.position.y - my + wa.size.height as i32) as f64 / s,
        island_x: ((main_pos.x - mx) as f64 + main_w / 2.0) / s,
        dragging: false,
    })
}

fn to_physical(env: &BuddyEnv, x: f64, y: f64) -> PhysicalPosition<i32> {
    PhysicalPosition::new(env.mon_x + (x * env.scale).round() as i32, env.mon_y + (y * env.scale).round() as i32)
}

fn place(app: &AppHandle, win: &WebviewWindow, x: f64, y: f64) {
    let state = app.state::<AppState>();
    let env = *state.buddy.lock().unwrap();
    let p = to_physical(&env, x, y);
    let _ = win.set_position(p);
    state.set_geometry(LABEL, Geometry { x: p.x, y: p.y, scale: env.scale });
}

/// Opens the buddy window. With `grab`, the pet spawns under the cursor and stays attached
/// to it (the user dragged it out of the island) until the mouse button is released.
#[tauri::command]
pub async fn buddy_open(app: AppHandle, grab: bool) -> Result<BuddyEnv, String> {
    let env = compute_env(&app).ok_or("no monitor")?;
    *app.state::<AppState>().buddy.lock().unwrap() = env;
    if app.get_webview_window(LABEL).is_some() {
        return Ok(env);
    }
    let (gx, gy) = (W / 2.0, H - 45.0);
    let (sx, sy) = match (grab, crate::hit::cursor_pos()) {
        (true, Some((cx, cy))) => ((cx - env.mon_x) as f64 / env.scale - gx, (cy - env.mon_y) as f64 / env.scale - gy),
        _ => (env.island_x - W / 2.0, 0.0),
    };
    let start = to_physical(&env, sx, sy);
    let win = WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App("index.html#buddy".into()))
        .title("Island buddy")
        .inner_size(W, H)
        .position(start.x as f64 / env.scale, start.y as f64 / env.scale)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .shadow(false)
        .focused(false)
        .visible_on_all_workspaces(true)
        .additional_browser_args(BROWSER_ARGS)
        .build()
        .map_err(|e| e.to_string())?;
    let _ = win.set_ignore_cursor_events(true);
    place(&app, &win, sx, sy);
    if grab {
        buddy_drag(app.clone(), gx, gy);
    }
    Ok(env)
}

#[tauri::command]
pub fn buddy_env(app: AppHandle) -> Result<BuddyEnv, String> {
    let mut env = compute_env(&app).ok_or("no monitor")?;
    let state = app.state::<AppState>();
    *state.buddy.lock().unwrap() = env;
    env.dragging = state.buddy_dragging.load(Ordering::SeqCst);
    Ok(env)
}

/// Current buddy window position in the buddy's logical, monitor-relative space.
#[tauri::command]
pub fn buddy_pos(app: AppHandle) -> Option<(f64, f64)> {
    let env = *app.state::<AppState>().buddy.lock().unwrap();
    let p = app.get_webview_window(LABEL)?.outer_position().ok()?;
    Some(((p.x - env.mon_x) as f64 / env.scale, (p.y - env.mon_y) as f64 / env.scale))
}

#[tauri::command]
pub fn buddy_close(app: AppHandle) {
    if let Some(win) = app.get_webview_window(LABEL) {
        let _ = win.destroy();
    }
    app.state::<AppState>().targets.lock().unwrap().remove(LABEL);
}

#[tauri::command]
pub fn buddy_move(app: AppHandle, x: f64, y: f64) {
    if let Some(win) = app.get_webview_window(LABEL) {
        place(&app, &win, x, y);
    }
}

#[derive(Serialize, Clone)]
struct Dropped {
    x: f64,
    y: f64,
    vx: f64,
    vy: f64,
}

#[cfg(windows)]
fn left_button_down() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    unsafe { (GetAsyncKeyState(0x01) as u16 & 0x8000) != 0 }
}

#[cfg(not(windows))]
fn left_button_down() -> bool {
    false
}

/// Follows the cursor natively until the mouse is released, then reports a throw velocity.
#[tauri::command]
pub fn buddy_drag(app: AppHandle, grab_x: f64, grab_y: f64) {
    let state = app.state::<AppState>();
    if state.buddy_dragging.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || {
        let env = *app.state::<AppState>().buddy.lock().unwrap();
        let mut samples: Vec<(Instant, f64, f64)> = Vec::with_capacity(8);
        let (mut x, mut y) = (0.0, 0.0);
        let started = Instant::now();
        while left_button_down() || started.elapsed() < Duration::from_millis(60) {
            if let (Some((cx, cy)), Some(win)) = (crate::hit::cursor_pos(), app.get_webview_window(LABEL)) {
                x = (cx - env.mon_x) as f64 / env.scale - grab_x;
                y = (cy - env.mon_y) as f64 / env.scale - grab_y;
                place(&app, &win, x, y);
                samples.push((Instant::now(), x, y));
                if samples.len() > 6 {
                    samples.remove(0);
                }
            }
            std::thread::sleep(Duration::from_millis(8));
        }
        let (vx, vy) = match (samples.first(), samples.last()) {
            (Some(a), Some(b)) if b.0 > a.0 => {
                let dt = (b.0 - a.0).as_secs_f64().max(0.001);
                ((b.1 - a.1) / dt, (b.2 - a.2) / dt)
            }
            _ => (0.0, 0.0),
        };
        app.state::<AppState>().buddy_dragging.store(false, Ordering::SeqCst);
        let _ = app.emit_to(LABEL, "buddy://dropped", Dropped { x, y, vx, vy });
    });
}
