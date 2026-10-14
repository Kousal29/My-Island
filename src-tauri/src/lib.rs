mod agents;
mod audio;
mod beta;
mod buddy;
mod calls;
mod clipboard;
mod drop;
mod files;
mod fullscreen;
mod hit;
mod links;
mod media;
mod notifications;
mod state;
mod stats;
mod window;
mod winsrc;

use state::AppState;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, WindowEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

fn shortcuts() -> [(Shortcut, &'static str); 6] {
    let ca = Some(Modifiers::CONTROL | Modifiers::ALT);
    [
        (Shortcut::new(ca, Code::Space), "toggle"),
        (Shortcut::new(ca, Code::KeyV), "stash:clips"),
        (Shortcut::new(ca, Code::KeyT), "todos"),
        (Shortcut::new(ca, Code::KeyP), "media:toggle"),
        (Shortcut::new(ca, Code::KeyB), "pet:roam"),
        (Shortcut::new(ca, Code::KeyM), "minimize"),
    ]
}

fn open_module(app: &AppHandle, target: &str) {
    window::set_compact(app.clone(), false);
    if let Some(win) = window::main_window(app) {
        window::show_no_activate(&win);
        let _ = win.set_ignore_cursor_events(false);
        let _ = win.set_focus();
    }
    let _ = app.emit("island://open", target);
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open island", true, Some("Ctrl+Alt+Space"))?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let roam = MenuItem::with_id(app, "pet-roam", "Let pet roam / call home", true, None::<&str>)?;
    let reposition = MenuItem::with_id(app, "reposition", "Re-center island", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit My Island", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &settings, &roam, &reposition, &sep, &quit])?;

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().cloned().expect("app icon"))
        .tooltip("My Island")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "open" => open_module(app, "toggle"),
            "settings" => open_module(app, "settings"),
            "reposition" => window::reposition(app),
            "pet-roam" => {
                let _ = app.emit_to("main", "island://open", "pet:roam");
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                open_module(tray.app_handle(), "toggle");
            }
        })
        .build(app)?;
    Ok(())
}

pub fn run() {
    let gs = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, sc, ev| {
            if ev.state() != ShortcutState::Pressed {
                return;
            }
            if let Some((_, target)) = shortcuts().iter().find(|(s, _)| s == sc) {
                if matches!(*target, "media:toggle" | "pet:roam" | "minimize") {
                    let _ = app.emit("island://open", *target);
                } else {
                    open_module(app, target);
                }
            }
        })
        .build();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| open_module(app, "toggle")))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(gs)
        .manage(AppState::default())
        .setup(|app| {
            let handle = app.handle().clone();
            beta::enforce(&handle);
            window::reposition(&handle);
            if let Some(win) = window::main_window(&handle) {
                let _ = win.set_ignore_cursor_events(true);
            }
            for (sc, _) in shortcuts() {
                if let Err(e) = app.global_shortcut().register(sc) {
                    eprintln!("shortcut registration failed: {e}");
                }
            }
            build_tray(&handle)?;
            hit::spawn(handle.clone());
            fullscreen::spawn(handle.clone());
            media::spawn(handle.clone());
            stats::spawn(handle.clone());
            clipboard::spawn(handle.clone());
            notifications::spawn(handle.clone());
            calls::spawn(handle.clone());
            agents::spawn(handle.clone());
            Ok(())
        })
        .on_window_event(|win, ev| match ev {
            WindowEvent::ScaleFactorChanged { .. } | WindowEvent::Moved(_) => window::refresh_geometry(win),
            WindowEvent::Focused(false) if win.label() == "main" => {
                let _ = win.emit("island://blur", ());
            }
            WindowEvent::CloseRequested { api, .. } if win.label() == "main" => api.prevent_close(),
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            hit::set_hit_rect,
            hit::set_force_interactive,
            window::list_monitors,
            window::set_monitor,
            window::set_compact,
            window::set_visible,
            window::focus_island,
            fullscreen::set_autohide_fullscreen,
            media::media_control,
            audio::get_volume,
            audio::set_volume,
            audio::set_mute,
            clipboard::set_clipboard_capture,
            links::fetch_link_meta,
            files::file_meta,
            files::open_path,
            files::reveal_path,
            files::open_url,
            buddy::buddy_prepare,
            buddy::buddy_open,
            buddy::buddy_take_launch,
            buddy::buddy_env,
            buddy::buddy_park,
            buddy::buddy_move,
            buddy::buddy_drag,
            buddy::buddy_pos,
            window::set_capture_privacy,
            window::idle_seconds,
            notifications::notify_status,
            notifications::set_notify_enabled,
            agents::claude_code_connected,
            agents::connect_claude_code,
            winsrc::focus_source_window,
            hit::set_buddy_look,
            beta::beta_info,
            drop::init_drop_target,
        ])
        .run(tauri::generate_context!())
        .expect("error while running My Island");
}
