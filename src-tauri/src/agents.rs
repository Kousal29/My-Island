//! A tiny local endpoint so coding agents (Claude Code, Codex, Aider, scripts…) can report
//! what they're doing, and the island can show it live:
//!
//!   curl -s -X POST http://127.0.0.1:47823/notify -d '{"source":"My agent","kind":"done","title":"Done","message":"Tests pass"}'
//!
//! Claude Code hook payloads (UserPromptSubmit, PreToolUse, Notification, Stop, SubagentStop,
//! SessionEnd) are understood natively. Bound to localhost only; it only displays text.

use serde::Serialize;
use serde_json::Value;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

pub const PORT: u16 = 47823;
/// `|| exit 0` keeps Claude Code quiet when the island isn't running (works in bash and cmd).
const HOOK_CMD: &str = r#"curl -s -m 1 -X POST http://127.0.0.1:47823/notify -H "Content-Type: application/json" --data-binary @- || exit 0"#;
const HOOK_EVENTS: [&str; 6] = ["UserPromptSubmit", "PreToolUse", "Notification", "Stop", "SubagentStop", "SessionEnd"];

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentEvent {
    pub source: String,
    pub title: String,
    pub body: String,
    pub project: String,
    /// "start" | "tool" | "attention" | "done" | "subdone" | "end" | "info"
    pub kind: String,
    pub at: f64,
    pub session: String,
    pub tool: String,
    /// Human description of the current action, e.g. "Editing Island.tsx".
    pub detail: String,
    /// Full path of a file being edited/written, if any.
    pub file: String,
    /// The terminal/IDE window the agent runs in (HWND as integer, 0 if unknown).
    pub window: i64,
    /// That window's executable, e.g. "Code.exe", "WindowsTerminal.exe".
    pub host: String,
}

fn s(v: &Value, k: &str) -> Option<String> {
    v.get(k).and_then(|x| x.as_str()).map(str::to_string).filter(|x| !x.trim().is_empty())
}

fn basename(p: &str) -> String {
    p.trim_end_matches(['/', '\\']).rsplit(['/', '\\']).next().unwrap_or(p).to_string()
}

fn clip(t: &str, n: usize) -> String {
    let one = t.split_whitespace().collect::<Vec<_>>().join(" ");
    if one.chars().count() > n { format!("{}…", one.chars().take(n).collect::<String>()) } else { one }
}

/// "Editing Island.tsx", "Running: npm test", "Searching for HitRect"…
fn describe_tool(tool: &str, input: &Value) -> (String, String) {
    let file = s(input, "file_path").or_else(|| s(input, "notebook_path")).unwrap_or_default();
    let name = basename(&file);
    let detail = match tool {
        "Edit" | "MultiEdit" => format!("Editing {name}"),
        "Write" => format!("Writing {name}"),
        "NotebookEdit" => format!("Editing {name}"),
        "Read" => format!("Reading {name}"),
        "Bash" | "PowerShell" => s(input, "description").map(|d| clip(&d, 60)).unwrap_or_else(|| format!("Running: {}", clip(&s(input, "command").unwrap_or_default(), 52))),
        "Grep" => format!("Searching for “{}”", clip(&s(input, "pattern").unwrap_or_default(), 40)),
        "Glob" => format!("Finding {}", clip(&s(input, "pattern").unwrap_or_default(), 40)),
        "WebFetch" => format!("Reading {}", clip(&s(input, "url").unwrap_or_default(), 48)),
        "WebSearch" => format!("Searching the web: {}", clip(&s(input, "query").unwrap_or_default(), 40)),
        "Task" | "Agent" => format!("Agent: {}", clip(&s(input, "description").unwrap_or_else(|| "working".into()), 48)),
        "TodoWrite" => "Updating the plan".into(),
        other if other.starts_with("mcp__") => format!("Using {}", other.rsplit("__").next().unwrap_or(other)),
        other => format!("Using {other}"),
    };
    let edits = matches!(tool, "Edit" | "MultiEdit" | "Write" | "NotebookEdit");
    (detail, if edits { file } else { String::new() })
}

fn to_event(v: &Value) -> AgentEvent {
    let hook = s(v, "hook_event_name");
    let source = s(v, "source").unwrap_or_else(|| if hook.is_some() { "Claude Code".into() } else { "Agent".into() });
    let project = s(v, "cwd").or_else(|| s(v, "project")).map(|p| basename(&p)).unwrap_or_default();
    let message = s(v, "message").or_else(|| s(v, "body")).unwrap_or_default();
    let session = s(v, "session_id").or_else(|| s(v, "session")).unwrap_or_else(|| format!("{source}:{project}"));
    let mut e = AgentEvent {
        source,
        project,
        session,
        at: SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0),
        ..Default::default()
    };
    match hook.as_deref() {
        Some("UserPromptSubmit") => {
            e.kind = "start".into();
            e.title = "Working".into();
            e.body = clip(&s(v, "prompt").unwrap_or_default(), 160);
            e.detail = "Thinking…".into();
        }
        Some("PreToolUse") => {
            let tool = s(v, "tool_name").unwrap_or_default();
            let (detail, file) = describe_tool(&tool, v.get("tool_input").unwrap_or(&Value::Null));
            e.kind = "tool".into();
            e.title = "Working".into();
            e.tool = tool;
            e.detail = detail;
            e.file = file;
        }
        Some("Notification") => {
            e.kind = "attention".into();
            e.title = "Needs your input".into();
            e.body = message;
        }
        Some("Stop") => {
            e.kind = "done".into();
            e.title = "Finished".into();
            e.body = message;
        }
        Some("SubagentStop") => {
            e.kind = "subdone".into();
            e.title = "Subagent finished".into();
        }
        Some("SessionEnd") => {
            e.kind = "end".into();
            e.title = "Session ended".into();
        }
        _ => {
            e.kind = match s(v, "kind").as_deref() {
                Some(k @ ("attention" | "done" | "start" | "tool")) => k.to_string(),
                _ => "info".into(),
            };
            e.title = s(v, "title").unwrap_or_else(|| "Update".into());
            e.body = message;
            e.detail = s(v, "detail").unwrap_or_default();
        }
    }
    if let Some(t) = s(v, "title") {
        e.title = t;
    }
    e
}

/// Parses JSON, repairing the most common hand-written mistake on Windows: unescaped
/// backslashes in paths (e.g. `"cwd": "C:\Users\me"`).
fn parse_lenient(body: &[u8]) -> Value {
    if let Ok(v) = serde_json::from_slice(body) {
        return v;
    }
    let text = String::from_utf8_lossy(body);
    let mut fixed = String::with_capacity(text.len() + 16);
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\\' {
            match chars.peek() {
                Some('"' | '\\' | '/' | 'b' | 'f' | 'n' | 'r' | 't' | 'u') => {
                    fixed.push(c);
                    fixed.push(chars.next().unwrap());
                }
                _ => fixed.push_str("\\\\"),
            }
        } else {
            fixed.push(c);
        }
    }
    serde_json::from_str(&fixed).unwrap_or_else(|_| Value::String(text.into_owned()))
}

fn handle(app: &AppHandle, mut stream: TcpStream) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let mut reader = BufReader::new(stream.try_clone().unwrap());
    let mut line = String::new();
    if reader.read_line(&mut line).is_err() {
        return;
    }
    let mut parts = line.split_whitespace();
    let (method, path) = (parts.next().unwrap_or(""), parts.next().unwrap_or(""));
    let mut len = 0usize;
    loop {
        let mut h = String::new();
        if reader.read_line(&mut h).is_err() || h == "\r\n" || h.is_empty() {
            break;
        }
        if let Some(v) = h.to_ascii_lowercase().strip_prefix("content-length:") {
            len = v.trim().parse().unwrap_or(0);
        }
    }
    // Tool payloads can carry whole files (Write); read it all, but cap at 16 MB.
    let mut body = vec![0u8; len.min(16 * 1024 * 1024)];
    let _ = reader.read_exact(&mut body);
    let status = match (method, path) {
        ("POST", "/notify") => {
            let v = parse_lenient(&body);
            let v = if v.is_string() { serde_json::json!({ "message": v }) } else { v };
            let mut e = to_event(&v);
            // Tool steps are frequent; resolve the source window only on milestones.
            if e.kind != "tool" {
                if let Some((hwnd, host)) = stream.peer_addr().ok().and_then(|a| crate::winsrc::source_window(a.port(), PORT)) {
                    e.window = hwnd as i64;
                    e.host = host;
                }
            }
            let _ = app.emit_to("main", "agent://notify", e);
            "204 No Content"
        }
        ("GET", "/health") => "200 OK",
        _ => "404 Not Found",
    };
    let _ = write!(stream, "HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
}

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        let Ok(listener) = TcpListener::bind(("127.0.0.1", PORT)) else {
            eprintln!("agent endpoint: port {PORT} unavailable");
            return;
        };
        for stream in listener.incoming().flatten() {
            let app = app.clone();
            // Hooks fire in bursts (one per tool call); don't let one slow client block others.
            std::thread::spawn(move || handle(&app, stream));
        }
    });
}

fn claude_settings_path() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).map(|h| PathBuf::from(h).join(".claude").join("settings.json"))
}

fn has_our_hook(v: &Value, event: &str) -> bool {
    v.pointer(&format!("/hooks/{event}"))
        .and_then(|a| a.as_array())
        .map(|arr| arr.iter().any(|e| e.to_string().contains("47823")))
        .unwrap_or(false)
}

/// True only when every hook the live view needs is installed.
#[tauri::command]
pub fn claude_code_connected() -> bool {
    let Some(p) = claude_settings_path() else { return false };
    let Ok(text) = std::fs::read_to_string(p) else { return false };
    let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
    HOOK_EVENTS.iter().all(|e| has_our_hook(&v, e))
}

/// Adds (or upgrades) the island's hooks in ~/.claude/settings.json, backing up the original.
#[tauri::command]
pub fn connect_claude_code() -> Result<String, String> {
    let path = claude_settings_path().ok_or("home folder not found")?;
    let text = std::fs::read_to_string(&path).unwrap_or_else(|_| "{}".into());
    let mut v: Value = serde_json::from_str(&text).map_err(|e| format!("couldn't parse {}: {e}", path.display()))?;
    if !v.is_object() {
        return Err("settings.json isn't a JSON object".into());
    }
    if path.exists() {
        std::fs::copy(&path, path.with_extension("json.bak")).map_err(|e| e.to_string())?;
    }
    let hooks = v.as_object_mut().unwrap().entry("hooks").or_insert_with(|| serde_json::json!({}));
    let hooks = hooks.as_object_mut().ok_or("\"hooks\" isn't an object")?;
    for event in HOOK_EVENTS {
        let arr = hooks.entry(event).or_insert_with(|| serde_json::json!([]));
        let arr = arr.as_array_mut().ok_or(format!("hooks.{event} isn't an array"))?;
        // Replace an older island hook (e.g. without `|| exit 0`) rather than duplicating it.
        arr.retain(|e| !e.to_string().contains("47823"));
        let entry = if event == "PreToolUse" {
            serde_json::json!({ "matcher": "*", "hooks": [{ "type": "command", "command": HOOK_CMD }] })
        } else {
            serde_json::json!({ "hooks": [{ "type": "command", "command": HOOK_CMD }] })
        };
        arr.push(entry);
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, serde_json::to_string_pretty(&v).unwrap()).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}
