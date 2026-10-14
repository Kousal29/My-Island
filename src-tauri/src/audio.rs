use serde::Serialize;

#[derive(Serialize)]
pub struct Volume {
    pub level: f32,
    pub muted: bool,
}

#[cfg(windows)]
mod imp {
    use windows::core::Result;
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};

    pub fn endpoint() -> Result<IAudioEndpointVolume> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let en: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let dev = en.GetDefaultAudioEndpoint(eRender, eConsole)?;
            dev.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None)
        }
    }
}

#[tauri::command(async)]
pub fn get_volume() -> Result<Volume, String> {
    #[cfg(windows)]
    unsafe {
        let ep = imp::endpoint().map_err(|e| e.to_string())?;
        return Ok(Volume {
            level: ep.GetMasterVolumeLevelScalar().map_err(|e| e.to_string())?,
            muted: ep.GetMute().map_err(|e| e.to_string())?.as_bool(),
        });
    }
    #[cfg(not(windows))]
    Ok(Volume { level: 0.5, muted: false })
}

#[tauri::command(async)]
pub fn set_volume(level: f32) -> Result<(), String> {
    #[cfg(windows)]
    unsafe {
        let ep = imp::endpoint().map_err(|e| e.to_string())?;
        let level = level.clamp(0.0, 1.0);
        ep.SetMasterVolumeLevelScalar(level, std::ptr::null()).map_err(|e| e.to_string())?;
        if level > 0.0 {
            let _ = ep.SetMute(false, std::ptr::null());
        }
    }
    #[cfg(not(windows))]
    let _ = level;
    Ok(())
}

#[tauri::command(async)]
pub fn set_mute(muted: bool) -> Result<(), String> {
    #[cfg(windows)]
    unsafe {
        let ep = imp::endpoint().map_err(|e| e.to_string())?;
        ep.SetMute(muted, std::ptr::null()).map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    let _ = muted;
    Ok(())
}
