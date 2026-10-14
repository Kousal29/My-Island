//! The desktop buddy: a tiny transparent window the pet lives in when it leaves the island.
//! The frontend drives behaviour (walk/fall/sleep); Rust owns window placement and native
//! drag so tossing the pet feels physical.
//!
//! Lifecycle: prepare (pre-warmed off-screen so it appears instantly) → launch (moved on
//! screen) → park (moved off-screen when the pet goes home) → destroyed after a while parked.
//!
//! The window is never hidden/shown: Tauri tracks visibility itself and re-applies it when
//! other window flags change (e.g. click-through toggling), which would hide a window shown
//! behind its back. Moving it off-screen avoids that and never steals focus.

use crate::state::{AppState, BuddyEnv, Geometry};
use serde::Serialize;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const LABEL: &str = "buddy";
pub const W: f64 = 150.0;
pub const H: f64 = 150.0;
/// Where the pet's head sits inside the buddy window (pet is bottom-centred, 100×84).
const HEAD_X: f64 = 75.0;
const HEAD_Y: f64 = 100.0;
/// Far off-screen parking spot (physical px).
const PARK: PhysicalPosition<i32> = PhysicalPosition { x: -32000, y: -32000 };
/// How long a parked buddy window is kept warm before it's destroyed.
const PARKED_TTL: Duration = Duration::from_secs(120);

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

fn build(app: &AppHandle, env: &BuddyEnv) -> Result<WebviewWindow, String> {
    let win = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html#buddy".into()))
        .title("Island buddy")
        .inner_size(W, H)
        .position(PARK.x as f64 / env.scale, PARK.y as f64 / env.scale)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .shadow(false)
        .focused(false)
        .visible(true)
        .visible_on_all_workspaces(true)
        .additional_browser_args(BROWSER_ARGS)
        .build()
        .map_err(|e| e.to_string())?;
    let _ = win.set_ignore_cursor_events(true);
    let _ = win.set_position(PARK);
    crate::window::apply_capture_privacy(&win, app.state::<AppState>().pet_capture_hidden.load(Ordering::Relaxed));
    Ok(win)
}

fn park_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(LABEL) {
        let _ = win.set_ignore_cursor_events(true);
        let _ = win.set_position(PARK);
    }
    if let Some(t) = app.state::<AppState>().targets.lock().unwrap().get_mut(LABEL) {
        t.rect = None;
    }
}

/// Fullscreen app started/ended: step off-screen and come back to the same spot.
pub fn set_fullscreen_hidden(app: &AppHandle, hidden: bool) {
    let state = app.state::<AppState>();
    if !state.buddy_active.load(Ordering::SeqCst) {
        return;
    }
    if hidden {
        if let Some(p) = buddy_pos(app.clone()) {
            *state.buddy_saved.lock().unwrap() = Some(p);
        }
        park_window(app);
    } else if let (Some((x, y)), Some(win)) = (state.buddy_saved.lock().unwrap().take(), app.get_webview_window(LABEL)) {
        place(app, &win, x, y);
    }
}

fn schedule_destroy(app: &AppHandle) {
    let gen = app.state::<AppState>().buddy_gen.load(Ordering::SeqCst);
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(PARKED_TTL);
        let state = app.state::<AppState>();
        if state.buddy_gen.load(Ordering::SeqCst) == gen && !state.buddy_active.load(Ordering::SeqCst) {
            if let Some(w) = app.get_webview_window(LABEL) {
                let _ = w.destroy();
            }
            state.targets.lock().unwrap().remove(LABEL);
        }
    });
}

/// Pre-creates the buddy window hidden, so letting the pet out is instant.
#[tauri::command]
pub async fn buddy_prepare(app: AppHandle) -> Result<(), String> {
    if app.get_webview_window(LABEL).is_some() {
        return Ok(());
    }
    let env = compute_env(&app).ok_or("no monitor")?;
    *app.state::<AppState>().buddy.lock().unwrap() = env;
    build(&app, &env)?;
    schedule_destroy(&app);
    Ok(())
}

/// Shows the pet on the desktop. `grab`: the user dragged it out of the island, so it spawns
/// under the cursor and stays attached until release. Otherwise it hops out of the pill.
#[tauri::command]
pub async fn buddy_open(app: AppHandle, grab: bool, slot_x: f64, slot_y: f64) -> Result<BuddyEnv, String> {
    let env = compute_env(&app).ok_or("no monitor")?;
    let state = app.state::<AppState>();
    *state.buddy.lock().unwrap() = env;
    state.buddy_gen.fetch_add(1, Ordering::SeqCst);
    state.buddy_active.store(true, Ordering::SeqCst);

    let (gx, gy) = (HEAD_X, HEAD_Y);
    let (sx, sy) = match (grab, crate::hit::cursor_pos()) {
        (true, Some((cx, cy))) => ((cx - env.mon_x) as f64 / env.scale - gx, (cy - env.mon_y) as f64 / env.scale - gy),
        // Start with the head exactly where it sat in the pill.
        _ => (env.island_x + slot_x - HEAD_X, slot_y - HEAD_Y),
    };
    let win = match app.get_webview_window(LABEL) {
        Some(w) => w,
        None => build(&app, &env)?,
    };
    place(&app, &win, sx, sy);
    *state.buddy_launch.lock().unwrap() = Some(if grab { "held" } else { "hop" }.to_string());
    let _ = app.emit_to(LABEL, "buddy://launch", ());
    if grab {
        buddy_drag(app.clone(), gx, gy);
    }
    Ok(env)
}

/// Consumed by the buddy page to learn how it was launched ("hop" | "held").
#[tauri::command]
pub fn buddy_take_launch(app: AppHandle) -> Option<String> {
    app.state::<AppState>().buddy_launch.lock().unwrap().take()
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

/// Hides the buddy (pet went home) and frees it later if it isn't needed again.
#[tauri::command]
pub fn buddy_park(app: AppHandle) {
    app.state::<AppState>().buddy_active.store(false, Ordering::SeqCst);
    park_window(&app);
    schedule_destroy(&app);
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
    /// Released over the island: the pet should go home.
    home: bool,
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

/// Is the cursor over (or just below) the island? That's the "drop to send home" zone.
fn over_island(app: &AppHandle, cx: i32, cy: i32) -> bool {
    let state = app.state::<AppState>();
    let Some(t) = state.targets.lock().unwrap().get("main").copied() else { return false };
    let Some(r) = t.rect else { return false };
    let s = t.geo.scale;
    let margin = 36.0;
    let left = t.geo.x as f64 + (r.x - margin) * s;
    let right = t.geo.x as f64 + (r.x + r.w + margin) * s;
    let top = t.geo.y as f64 - 4.0;
    let bottom = t.geo.y as f64 + (r.y + r.h + margin) * s;
    let (cx, cy) = (cx as f64, cy as f64);
    cx >= left && cx <= right && cy >= top && cy <= bottom
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
        let mut near = false;
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
                let n = over_island(&app, cx, cy);
                if n != near {
                    near = n;
                    let _ = app.emit_to("main", "buddy://over-island", n);
                    let _ = app.emit_to(LABEL, "buddy://over-island", n);
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
        if near {
            let _ = app.emit_to("main", "buddy://over-island", false);
        }
        let _ = app.emit_to(LABEL, "buddy://dropped", Dropped { x, y, vx, vy, home: near });
    });
}
