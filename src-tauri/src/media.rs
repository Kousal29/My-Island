//! Now-playing via Windows GlobalSystemMediaTransportControls (works with Spotify,
//! browsers, Apple Music, VLC, etc. — anything that reports to the media flyout).

use serde::Serialize;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone, PartialEq, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MediaState {
    pub active: bool,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub app_id: String,
    pub playing: bool,
    pub position_ms: f64,
    pub duration_ms: f64,
    /// Unix ms at which `position_ms` was true; the UI extrapolates while playing.
    pub sampled_at: f64,
    pub can_next: bool,
    pub can_prev: bool,
    pub can_seek: bool,
    pub artwork: Option<String>,
}

fn unix_ms() -> f64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0)
}

#[cfg(windows)]
mod imp {
    use super::*;
    use base64::Engine;
    use windows::core::Result;
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession as Session,
        GlobalSystemMediaTransportControlsSessionManager as Manager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
    };
    use windows::Storage::Streams::DataReader;
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

    /// 100ns ticks between 1601-01-01 and 1970-01-01.
    const EPOCH_DIFF_TICKS: i64 = 116_444_736_000_000_000;

    pub fn init_com() {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
    }

    pub fn manager() -> Result<Manager> {
        Manager::RequestAsync()?.get()
    }

    pub fn session() -> Result<Session> {
        manager()?.GetCurrentSession()
    }

    pub fn read_artwork(session: &Session) -> Option<String> {
        let props = session.TryGetMediaPropertiesAsync().ok()?.get().ok()?;
        let thumb = props.Thumbnail().ok()?;
        let stream = thumb.OpenReadAsync().ok()?.get().ok()?;
        let size = stream.Size().ok()? as u32;
        if size == 0 || size > 8_000_000 {
            return None;
        }
        let mime = stream.ContentType().map(|s| s.to_string()).unwrap_or_default();
        let reader = DataReader::CreateDataReader(&stream).ok()?;
        reader.LoadAsync(size).ok()?.get().ok()?;
        let mut buf = vec![0u8; size as usize];
        reader.ReadBytes(&mut buf).ok()?;
        let mime = if mime.starts_with("image/") { mime } else { "image/png".into() };
        Some(format!("data:{};base64,{}", mime, base64::engine::general_purpose::STANDARD.encode(buf)))
    }

    pub fn snapshot(session: &Session) -> Result<MediaState> {
        let props = session.TryGetMediaPropertiesAsync()?.get()?;
        let info = session.GetPlaybackInfo()?;
        let controls = info.Controls()?;
        let tl = session.GetTimelineProperties()?;
        let playing = info.PlaybackStatus()? == Status::Playing;

        let start = tl.StartTime()?.Duration;
        let end = tl.EndTime()?.Duration;
        let pos = tl.Position()?.Duration;
        let updated = tl.LastUpdatedTime()?.UniversalTime;
        let updated_unix_ms = ((updated - EPOCH_DIFF_TICKS) / 10_000) as f64;
        let now = unix_ms();
        let mut position_ms = ((pos - start).max(0) / 10_000) as f64;
        if playing && updated > 0 && now > updated_unix_ms {
            position_ms += now - updated_unix_ms;
        }
        let duration_ms = ((end - start).max(0) / 10_000) as f64;
        if duration_ms > 0.0 {
            position_ms = position_ms.min(duration_ms);
        }

        Ok(MediaState {
            active: true,
            title: props.Title()?.to_string(),
            artist: props.Artist()?.to_string(),
            album: props.AlbumTitle().map(|s| s.to_string()).unwrap_or_default(),
            app_id: session.SourceAppUserModelId().map(|s| s.to_string()).unwrap_or_default(),
            playing,
            position_ms,
            duration_ms,
            sampled_at: now,
            can_next: controls.IsNextEnabled().unwrap_or(false),
            can_prev: controls.IsPreviousEnabled().unwrap_or(false),
            can_seek: controls.IsPlaybackPositionEnabled().unwrap_or(false) && duration_ms > 0.0,
            artwork: None,
        })
    }

    pub fn control(action: &str, value: Option<f64>) -> Result<()> {
        init_com();
        let s = session()?;
        match action {
            "toggle" => {
                s.TryTogglePlayPauseAsync()?.get()?;
            }
            "play" => {
                s.TryPlayAsync()?.get()?;
            }
            "pause" => {
                s.TryPauseAsync()?.get()?;
            }
            "next" => {
                s.TrySkipNextAsync()?.get()?;
            }
            "prev" => {
                s.TrySkipPreviousAsync()?.get()?;
            }
            "seek" => {
                let start = s.GetTimelineProperties()?.StartTime()?.Duration;
                let ticks = start + (value.unwrap_or(0.0) * 10_000.0) as i64;
                s.TryChangePlaybackPositionAsync(ticks)?.get()?;
            }
            _ => {}
        }
        Ok(())
    }
}

pub fn spawn(app: AppHandle) {
    #[cfg(windows)]
    std::thread::spawn(move || {
        imp::init_com();
        let mut mgr = imp::manager().ok();
        let mut last = MediaState::default();
        let mut art_key = String::new();
        let mut art: Option<String> = None;
        let mut last_emit = 0.0;
        loop {
            if mgr.is_none() {
                mgr = imp::manager().ok();
            }
            let current = match &mgr {
                Some(m) => m.GetCurrentSession(),
                None => imp::session(),
            };
            let mut next = match current.and_then(|s| imp::snapshot(&s).map(|m| (s, m))) {
                Ok((s, m)) => {
                    let key = format!("{}\u{1}{}\u{1}{}", m.app_id, m.title, m.artist);
                    if key != art_key {
                        // Some apps publish metadata before the thumbnail is ready; retry briefly.
                        art = imp::read_artwork(&s);
                        if art.is_some() || m.title.is_empty() {
                            art_key = key;
                        }
                    }
                    m
                }
                Err(_) => {
                    art_key.clear();
                    art = None;
                    MediaState::default()
                }
            };
            next.artwork = art.clone();

            let now = unix_ms();
            let drift = if last.playing && next.playing {
                let expected = last.position_ms + (next.sampled_at - last.sampled_at);
                (expected - next.position_ms).abs()
            } else {
                0.0
            };
            let changed = next.active != last.active
                || next.title != last.title
                || next.artist != last.artist
                || next.playing != last.playing
                || next.duration_ms != last.duration_ms
                || next.can_next != last.can_next
                || next.can_prev != last.can_prev
                || next.artwork.is_some() != last.artwork.is_some()
                || drift > 1500.0
                || (!next.playing && (next.position_ms - last.position_ms).abs() > 500.0);
            if changed || (next.active && now - last_emit > 10_000.0) {
                let _ = app.emit("media://update", &next);
                last_emit = now;
                last = next;
            }
            std::thread::sleep(Duration::from_millis(if last.active { 700 } else { 1500 }));
        }
    });
    #[cfg(not(windows))]
    let _ = app;
}

#[tauri::command(async)]
pub fn media_control(action: String, value: Option<f64>) -> Result<(), String> {
    #[cfg(windows)]
    return imp::control(&action, value).map_err(|e| e.to_string());
    #[cfg(not(windows))]
    {
        let _ = (action, value);
        Ok(())
    }
}
