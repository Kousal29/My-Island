//! Works out which desktop window an agent event came from, so "Needs your input" can take
//! you straight there. The hook's `curl` connects to our local endpoint; we look up which
//! process owns that TCP connection, then walk up its parent processes (curl → shell →
//! claude → terminal/IDE) to the first one that owns a visible top-level window.

#[cfg(windows)]
mod imp {
    use std::collections::HashMap;
    use windows::core::BOOL;
    use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
    use windows::Win32::NetworkManagement::IpHelper::{GetExtendedTcpTable, MIB_TCPTABLE_OWNER_PID, TCP_TABLE_OWNER_PID_ALL};
    use windows::Win32::Networking::WinSock::AF_INET;
    use windows::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS};
    use windows::Win32::UI::Input::KeyboardAndMouse::{keybd_event, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, VK_MENU};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindow, GetWindowTextLengthW, GetWindowThreadProcessId, IsIconic, IsWindowVisible, SetForegroundWindow, ShowWindow, GW_OWNER, SW_RESTORE,
    };

    /// PID owning the client side of a localhost connection to `server_port`.
    fn owner_pid(client_port: u16, server_port: u16) -> Option<u32> {
        unsafe {
            let mut size = 0u32;
            GetExtendedTcpTable(None, &mut size, false, AF_INET.0 as u32, TCP_TABLE_OWNER_PID_ALL, 0);
            let mut buf = vec![0u8; size as usize + 1024];
            size = buf.len() as u32;
            if GetExtendedTcpTable(Some(buf.as_mut_ptr() as _), &mut size, false, AF_INET.0 as u32, TCP_TABLE_OWNER_PID_ALL, 0) != 0 {
                return None;
            }
            let table = &*(buf.as_ptr() as *const MIB_TCPTABLE_OWNER_PID);
            let rows = std::slice::from_raw_parts(table.table.as_ptr(), table.dwNumEntries as usize);
            let port = |p: u32| u16::from_be((p & 0xffff) as u16);
            rows.iter().find(|r| port(r.dwLocalPort) == client_port && port(r.dwRemotePort) == server_port).map(|r| r.dwOwningPid)
        }
    }

    /// pid → (parent pid, exe name)
    fn processes() -> HashMap<u32, (u32, String)> {
        let mut out = HashMap::new();
        unsafe {
            let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else { return out };
            let mut e = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
            let mut ok = Process32FirstW(snap, &mut e).is_ok();
            while ok {
                let len = e.szExeFile.iter().position(|&c| c == 0).unwrap_or(e.szExeFile.len());
                out.insert(e.th32ProcessID, (e.th32ParentProcessID, String::from_utf16_lossy(&e.szExeFile[..len])));
                ok = Process32NextW(snap, &mut e).is_ok();
            }
            let _ = CloseHandle(snap);
        }
        out
    }

    struct Find {
        pid: u32,
        found: HWND,
    }

    unsafe extern "system" fn visit(h: HWND, l: LPARAM) -> BOOL {
        let f = &mut *(l.0 as *mut Find);
        let mut pid = 0u32;
        GetWindowThreadProcessId(h, Some(&mut pid));
        if pid == f.pid && IsWindowVisible(h).as_bool() && GetWindow(h, GW_OWNER).unwrap_or_default().is_invalid() && GetWindowTextLengthW(h) > 0 {
            f.found = h;
            return false.into();
        }
        true.into()
    }

    fn main_window(pid: u32) -> Option<HWND> {
        let mut f = Find { pid, found: HWND::default() };
        unsafe {
            let _ = EnumWindows(Some(visit), LPARAM(&mut f as *mut Find as isize));
        }
        (!f.found.is_invalid()).then_some(f.found)
    }

    pub fn source_window(client_port: u16, server_port: u16) -> Option<(isize, String)> {
        let mut pid = owner_pid(client_port, server_port)?;
        let procs = processes();
        for _ in 0..16 {
            if let Some(h) = main_window(pid) {
                let exe = procs.get(&pid).map(|(_, e)| e.clone()).unwrap_or_default();
                return Some((h.0 as isize, exe));
            }
            match procs.get(&pid) {
                Some(&(parent, _)) if parent != 0 && parent != pid => pid = parent,
                _ => break,
            }
        }
        None
    }

    pub fn focus(hwnd: isize) -> bool {
        let h = HWND(hwnd as _);
        unsafe {
            if IsIconic(h).as_bool() {
                let _ = ShowWindow(h, SW_RESTORE);
            }
            // A synthetic Alt tap lifts Windows' foreground lock so the switch is allowed.
            keybd_event(VK_MENU.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
            keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_KEYUP, 0);
            SetForegroundWindow(h).as_bool()
        }
    }
}

#[cfg(windows)]
pub use imp::source_window;

#[cfg(not(windows))]
pub fn source_window(_: u16, _: u16) -> Option<(isize, String)> {
    None
}

/// Brings the agent's terminal/IDE window to the front.
#[tauri::command]
pub fn focus_source_window(hwnd: i64) -> bool {
    #[cfg(windows)]
    return imp::focus(hwnd as isize);
    #[cfg(not(windows))]
    {
        let _ = hwnd;
        false
    }
}
