use serde::Deserialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU64};
use std::sync::Mutex;

/// Interactive rectangle in window-relative logical (CSS) pixels.
#[derive(Clone, Copy, Debug, Deserialize, Default, PartialEq)]
pub struct HitRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// Window origin (physical px) + scale factor, cached so the hit-test loop avoids IPC.
#[derive(Clone, Copy, Debug, Default)]
pub struct Geometry {
    pub x: i32,
    pub y: i32,
    pub scale: f64,
}

/// A click-through overlay window that only accepts the mouse inside `rect`.
#[derive(Clone, Copy, Debug, Default)]
pub struct HitTarget {
    pub rect: Option<HitRect>,
    pub geo: Geometry,
}

/// Where the desktop buddy lives: its monitor's origin/scale and work area (logical px, monitor-relative).
#[derive(Clone, Copy, Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyEnv {
    #[serde(skip)]
    pub mon_x: i32,
    #[serde(skip)]
    pub mon_y: i32,
    pub scale: f64,
    pub work_left: f64,
    pub work_top: f64,
    pub work_right: f64,
    pub work_bottom: f64,
    pub island_x: f64,
    /// True while the native drag loop is carrying the buddy (e.g. dragged out of the island).
    pub dragging: bool,
}

pub struct AppState {
    pub targets: Mutex<HashMap<String, HitTarget>>,
    pub force_interactive: AtomicBool,
    pub autohide_fullscreen: AtomicBool,
    pub clipboard_capture: AtomicBool,
    pub monitor_index: AtomicI32,
    /// Small window while collapsed. Off by default: resizing the window at the end of a
    /// collapse caused a visible one-frame "settle", and a static transparent window costs
    /// nothing to keep large.
    pub compact: AtomicBool,
    pub buddy: Mutex<BuddyEnv>,
    pub buddy_dragging: AtomicBool,
    /// The pet is out on the desktop (window shown). False while parked/pre-warmed.
    pub buddy_active: AtomicBool,
    /// Bumped on every launch so a pending "destroy parked window" timer knows it's stale.
    pub buddy_gen: AtomicU64,
    /// "hop" | "held" — read by the buddy page when it boots after a launch.
    pub buddy_launch: Mutex<Option<String>>,
    /// Buddy position (logical) saved while it's moved off-screen for a fullscreen app.
    pub buddy_saved: Mutex<Option<(f64, f64)>>,
    pub notify_enabled: AtomicBool,
    /// "pending" | "allowed" | "denied" | "unavailable"
    pub notify_status: Mutex<&'static str>,
    /// Exclude windows from screen capture/sharing (still visible to the user).
    pub pet_capture_hidden: AtomicBool,
    pub island_capture_hidden: AtomicBool,
    /// Desktop pet's eyes follow the cursor (cursor position is streamed to it).
    pub buddy_look: AtomicBool,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            targets: Mutex::new(HashMap::new()),
            force_interactive: AtomicBool::new(false),
            autohide_fullscreen: AtomicBool::new(true),
            clipboard_capture: AtomicBool::new(true),
            monitor_index: AtomicI32::new(-1),
            compact: AtomicBool::new(false),
            buddy: Mutex::new(BuddyEnv::default()),
            buddy_dragging: AtomicBool::new(false),
            buddy_active: AtomicBool::new(false),
            buddy_gen: AtomicU64::new(0),
            buddy_launch: Mutex::new(None),
            buddy_saved: Mutex::new(None),
            notify_enabled: AtomicBool::new(true),
            notify_status: Mutex::new("pending"),
            pet_capture_hidden: AtomicBool::new(true),
            island_capture_hidden: AtomicBool::new(false),
            buddy_look: AtomicBool::new(true),
        }
    }
}

impl AppState {
    pub fn set_geometry(&self, label: &str, geo: Geometry) {
        self.targets.lock().unwrap().entry(label.to_string()).or_default().geo = geo;
    }
}
