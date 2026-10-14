//! Native OLE drop target for the island. Tauri's built-in handler only understands file
//! paths; this one also accepts links dragged from browsers and plain text, and reports
//! what's being dragged on enter so the UI can say "Drop link" / "Drop 3 files".

use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct DragPayload {
    /// "enter" | "over" | "leave" | "drop"
    pub phase: &'static str,
    /// "files" | "link" | "text" | "unknown"
    pub kind: &'static str,
    pub count: u32,
    pub files: Vec<String>,
    pub url: Option<String>,
    pub text: Option<String>,
}

#[cfg(windows)]
mod imp {
    use super::*;
    use std::cell::Cell;
    use windows::core::{implement, w, Ref, Result, BOOL};
    use windows::Win32::Foundation::{HWND, LPARAM, POINTL};
    use windows::Win32::System::Com::{IDataObject, DVASPECT_CONTENT, FORMATETC, TYMED_HGLOBAL};
    use windows::Win32::System::DataExchange::RegisterClipboardFormatW;
    use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};
    use windows::Win32::System::Ole::{
        IDropTarget, IDropTarget_Impl, RegisterDragDrop, ReleaseStgMedium, RevokeDragDrop, CF_HDROP, CF_UNICODETEXT, DROPEFFECT, DROPEFFECT_COPY,
        DROPEFFECT_LINK, DROPEFFECT_NONE,
    };
    use windows::Win32::System::SystemServices::MODIFIERKEYS_FLAGS;
    use windows::Win32::UI::Shell::{DragQueryFileW, HDROP};
    use windows::Win32::UI::WindowsAndMessaging::EnumChildWindows;

    fn fmt(cf: u16) -> FORMATETC {
        FORMATETC { cfFormat: cf, ptd: std::ptr::null_mut(), dwAspect: DVASPECT_CONTENT.0, lindex: -1, tymed: TYMED_HGLOBAL.0 as u32 }
    }

    fn url_formats() -> [u16; 2] {
        unsafe { [RegisterClipboardFormatW(w!("UniformResourceLocatorW")) as u16, RegisterClipboardFormatW(w!("UniformResourceLocator")) as u16] }
    }

    fn has(obj: &IDataObject, cf: u16) -> bool {
        unsafe { obj.QueryGetData(&fmt(cf)).is_ok() }
    }

    /// Reads an HGLOBAL-backed format as raw bytes.
    fn read_bytes(obj: &IDataObject, cf: u16) -> Option<Vec<u8>> {
        unsafe {
            let mut medium = obj.GetData(&fmt(cf)).ok()?;
            let h = medium.u.hGlobal;
            let ptr = GlobalLock(h) as *const u8;
            let out = if ptr.is_null() { None } else { Some(std::slice::from_raw_parts(ptr, GlobalSize(h)).to_vec()) };
            let _ = GlobalUnlock(h);
            ReleaseStgMedium(&mut medium);
            out
        }
    }

    fn read_utf16(obj: &IDataObject, cf: u16) -> Option<String> {
        let b = read_bytes(obj, cf)?;
        let wide: Vec<u16> = b.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).take_while(|&c| c != 0).collect();
        Some(String::from_utf16_lossy(&wide)).filter(|s| !s.trim().is_empty())
    }

    fn read_ansi(obj: &IDataObject, cf: u16) -> Option<String> {
        let b = read_bytes(obj, cf)?;
        let end = b.iter().position(|&c| c == 0).unwrap_or(b.len());
        Some(String::from_utf8_lossy(&b[..end]).into_owned()).filter(|s| !s.trim().is_empty())
    }

    fn read_files(obj: &IDataObject) -> Vec<String> {
        unsafe {
            let Ok(mut medium) = obj.GetData(&fmt(CF_HDROP.0)) else { return vec![] };
            let hdrop = HDROP(medium.u.hGlobal.0);
            let n = DragQueryFileW(hdrop, u32::MAX, None);
            let mut out = Vec::with_capacity(n as usize);
            for i in 0..n {
                let len = DragQueryFileW(hdrop, i, None) as usize;
                let mut buf = vec![0u16; len + 1];
                DragQueryFileW(hdrop, i, Some(&mut buf));
                out.push(String::from_utf16_lossy(&buf[..len]));
            }
            ReleaseStgMedium(&mut medium);
            out
        }
    }

    fn classify(obj: &IDataObject) -> (&'static str, u32) {
        if has(obj, CF_HDROP.0) {
            let n = unsafe {
                obj.GetData(&fmt(CF_HDROP.0))
                    .map(|mut m| {
                        let n = DragQueryFileW(HDROP(m.u.hGlobal.0), u32::MAX, None);
                        ReleaseStgMedium(&mut m);
                        n
                    })
                    .unwrap_or(1)
            };
            return ("files", n);
        }
        if url_formats().iter().any(|&f| has(obj, f)) {
            return ("link", 1);
        }
        if has(obj, CF_UNICODETEXT.0) {
            return ("text", 1);
        }
        ("unknown", 0)
    }

    fn effect_for(kind: &str, allowed: DROPEFFECT) -> DROPEFFECT {
        if kind == "unknown" {
            return DROPEFFECT_NONE;
        }
        if allowed.0 & DROPEFFECT_COPY.0 != 0 {
            DROPEFFECT_COPY
        } else if allowed.0 & DROPEFFECT_LINK.0 != 0 {
            DROPEFFECT_LINK
        } else {
            DROPEFFECT_NONE
        }
    }

    #[implement(IDropTarget)]
    pub struct Target {
        app: AppHandle,
        kind: Cell<&'static str>,
    }

    impl Target {
        fn emit(&self, p: DragPayload) {
            let _ = self.app.emit_to("main", "island://drag", p);
        }
    }

    impl IDropTarget_Impl for Target_Impl {
        fn DragEnter(&self, obj: Ref<'_, IDataObject>, _: MODIFIERKEYS_FLAGS, _: &POINTL, effect: *mut DROPEFFECT) -> Result<()> {
            let (kind, count) = obj.as_ref().map(classify).unwrap_or(("unknown", 0));
            self.kind.set(kind);
            unsafe { *effect = effect_for(kind, *effect) };
            self.emit(DragPayload { phase: "enter", kind, count, ..Default::default() });
            Ok(())
        }

        fn DragOver(&self, _: MODIFIERKEYS_FLAGS, _: &POINTL, effect: *mut DROPEFFECT) -> Result<()> {
            unsafe { *effect = effect_for(self.kind.get(), *effect) };
            Ok(())
        }

        fn DragLeave(&self) -> Result<()> {
            self.emit(DragPayload { phase: "leave", kind: self.kind.get(), ..Default::default() });
            Ok(())
        }

        fn Drop(&self, obj: Ref<'_, IDataObject>, _: MODIFIERKEYS_FLAGS, _: &POINTL, effect: *mut DROPEFFECT) -> Result<()> {
            let kind = self.kind.get();
            unsafe { *effect = effect_for(kind, *effect) };
            let Some(obj) = obj.as_ref() else { return Ok(()) };
            let mut p = DragPayload { phase: "drop", kind, ..Default::default() };
            match kind {
                "files" => p.files = read_files(obj),
                "link" => {
                    let [w16, ansi] = url_formats();
                    p.url = read_utf16(obj, w16).or_else(|| read_ansi(obj, ansi)).map(|u| u.lines().next().unwrap_or("").trim().to_string());
                    p.text = read_utf16(obj, CF_UNICODETEXT.0);
                }
                "text" => p.text = read_utf16(obj, CF_UNICODETEXT.0),
                _ => {}
            }
            p.count = p.files.len().max(1) as u32;
            self.emit(p);
            Ok(())
        }
    }

    unsafe extern "system" fn collect(h: HWND, l: LPARAM) -> BOOL {
        (*(l.0 as *mut Vec<HWND>)).push(h);
        true.into()
    }

    /// Registers our drop target on the window and every WebView2 child window.
    /// Must run on the main (OLE STA) thread.
    pub fn register(app: &AppHandle, top: HWND) {
        let target: IDropTarget = Target { app: app.clone(), kind: Cell::new("unknown") }.into();
        let mut hwnds = vec![top];
        unsafe {
            let _ = EnumChildWindows(Some(top), Some(collect), LPARAM(&mut hwnds as *mut _ as isize));
            for h in hwnds {
                let _ = RevokeDragDrop(h);
                if let Err(e) = RegisterDragDrop(h, &target) {
                    eprintln!("RegisterDragDrop failed for {h:?}: {e}");
                }
            }
        }
    }
}

/// Called by the island once its webview is up (child windows exist by then).
#[tauri::command]
pub fn init_drop_target(app: AppHandle) {
    #[cfg(windows)]
    {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Some(win) = crate::window::main_window(&handle) {
                if let Ok(h) = win.hwnd() {
                    imp::register(&handle, windows::Win32::Foundation::HWND(h.0 as _));
                }
            }
        });
    }
    #[cfg(not(windows))]
    let _ = app;
}
