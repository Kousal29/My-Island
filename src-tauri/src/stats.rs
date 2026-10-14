use serde::Serialize;
use std::time::{Duration, Instant};
use sysinfo::{Disks, Networks, System};
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Battery {
    pub present: bool,
    pub percent: u8,
    pub charging: bool,
    pub plugged: bool,
    pub seconds_left: Option<u32>,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub cpu: f32,
    pub cores: Vec<f32>,
    pub mem_used: u64,
    pub mem_total: u64,
    pub swap_used: u64,
    pub swap_total: u64,
    pub net_down: f64,
    pub net_up: f64,
    pub disk_used: u64,
    pub disk_total: u64,
    pub uptime: u64,
    pub processes: usize,
    pub battery: Battery,
}

#[cfg(windows)]
fn battery() -> Battery {
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    let mut s = SYSTEM_POWER_STATUS::default();
    if unsafe { GetSystemPowerStatus(&mut s) }.is_err() {
        return Battery::default();
    }
    let present = s.BatteryFlag & 128 == 0 && s.BatteryLifePercent != 255;
    Battery {
        present,
        percent: if s.BatteryLifePercent == 255 { 100 } else { s.BatteryLifePercent },
        charging: s.BatteryFlag & 8 != 0,
        plugged: s.ACLineStatus == 1,
        seconds_left: if s.BatteryLifeTime == u32::MAX { None } else { Some(s.BatteryLifeTime) },
    }
}

#[cfg(not(windows))]
fn battery() -> Battery {
    Battery::default()
}

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        let mut sys = System::new();
        let mut nets = Networks::new_with_refreshed_list();
        let mut disks = Disks::new_with_refreshed_list();
        let mut last = Instant::now();
        let mut tick: u64 = 0;
        sys.refresh_cpu_usage();
        loop {
            std::thread::sleep(Duration::from_millis(1500));
            sys.refresh_cpu_usage();
            sys.refresh_memory();
            nets.refresh(true);
            let dt = last.elapsed().as_secs_f64().max(0.001);
            last = Instant::now();
            if tick % 20 == 0 {
                disks.refresh(true);
                sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
            }
            tick += 1;

            let (down, up) = nets.iter().fold((0u64, 0u64), |(d, u), (_, n)| (d + n.received(), u + n.transmitted()));
            let sys_drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into());
            let disk = disks
                .iter()
                .find(|d| d.mount_point().to_string_lossy().to_uppercase().starts_with(&sys_drive.to_uppercase()))
                .or_else(|| disks.iter().next());

            let stats = Stats {
                cpu: sys.global_cpu_usage(),
                cores: sys.cpus().iter().map(|c| c.cpu_usage()).collect(),
                mem_used: sys.used_memory(),
                mem_total: sys.total_memory(),
                swap_used: sys.used_swap(),
                swap_total: sys.total_swap(),
                net_down: down as f64 / dt,
                net_up: up as f64 / dt,
                disk_used: disk.map(|d| d.total_space() - d.available_space()).unwrap_or(0),
                disk_total: disk.map(|d| d.total_space()).unwrap_or(0),
                uptime: System::uptime(),
                processes: sys.processes().len(),
                battery: battery(),
            };
            let _ = app.emit("stats://update", &stats);
        }
    });
}
