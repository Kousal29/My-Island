use regex::Regex;
use serde::Serialize;
use std::io::Read;
use std::sync::OnceLock;
use std::time::Duration;

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LinkMeta {
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub image: Option<String>,
    pub favicon: Option<String>,
    pub site_name: Option<String>,
}

fn meta_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r#"(?is)<meta\s[^>]*>"#).unwrap())
}
fn link_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r#"(?is)<link\s[^>]*>"#).unwrap())
}
fn attr_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r#"(?is)([a-z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')"#).unwrap())
}
fn title_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r#"(?is)<title[^>]*>(.*?)</title>"#).unwrap())
}

fn attrs(tag: &str) -> Vec<(String, String)> {
    attr_re()
        .captures_iter(tag)
        .map(|c| {
            let v = c.get(2).or(c.get(3)).map(|m| m.as_str()).unwrap_or("");
            (c[1].to_lowercase(), decode(v))
        })
        .collect()
}

fn decode(s: &str) -> String {
    let s = s
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ");
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn origin(url: &str) -> Option<String> {
    let scheme_end = url.find("://")? + 3;
    let rest = &url[scheme_end..];
    let host_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    Some(url[..scheme_end + host_end].to_string())
}

fn resolve(base: &str, href: &str) -> String {
    if href.starts_with("http://") || href.starts_with("https://") || href.starts_with("data:") {
        return href.to_string();
    }
    if let Some(rest) = href.strip_prefix("//") {
        return format!("https://{rest}");
    }
    let o = origin(base).unwrap_or_default();
    if href.starts_with('/') {
        return format!("{o}{href}");
    }
    let dir = match base.rfind('/') {
        Some(i) if i >= o.len() => &base[..=i],
        _ => return format!("{o}/{href}"),
    };
    format!("{dir}{href}")
}

#[tauri::command(async)]
pub fn fetch_link_meta(url: String) -> Result<LinkMeta, String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("unsupported url".into());
    }
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(8))
        .redirects(6)
        .build();
    let resp = agent
        .get(&url)
        .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MyIsland/0.1 LinkPreview")
        .set("Accept", "text/html,application/xhtml+xml")
        .call()
        .map_err(|e| e.to_string())?;
    let final_url = resp.get_url().to_string();
    let mut html = String::new();
    resp.into_reader()
        .take(600_000)
        .read_to_string(&mut html)
        .map_err(|e| e.to_string())?;
    let head = match html.to_lowercase().find("</head>") {
        Some(i) => &html[..i],
        None => &html[..],
    };

    let mut m = LinkMeta { url: final_url.clone(), ..Default::default() };
    for tag in meta_re().find_iter(head) {
        let a = attrs(tag.as_str());
        let key = a.iter().find(|(k, _)| k == "property" || k == "name").map(|(_, v)| v.to_lowercase());
        let content = a.iter().find(|(k, _)| k == "content").map(|(_, v)| v.clone());
        let (Some(key), Some(content)) = (key, content) else { continue };
        if content.is_empty() {
            continue;
        }
        match key.as_str() {
            "og:title" | "twitter:title" if m.title.is_none() => m.title = Some(content),
            "og:description" | "twitter:description" | "description" if m.description.is_none() => m.description = Some(content),
            "og:image" | "twitter:image" | "twitter:image:src" if m.image.is_none() => m.image = Some(resolve(&final_url, &content)),
            "og:site_name" if m.site_name.is_none() => m.site_name = Some(content),
            _ => {}
        }
    }
    if m.title.is_none() {
        m.title = title_re().captures(head).map(|c| decode(&c[1])).filter(|t| !t.is_empty());
    }
    let mut best_icon: Option<(i32, String)> = None;
    for tag in link_re().find_iter(head) {
        let a = attrs(tag.as_str());
        let rel = a.iter().find(|(k, _)| k == "rel").map(|(_, v)| v.to_lowercase()).unwrap_or_default();
        let Some(href) = a.iter().find(|(k, _)| k == "href").map(|(_, v)| v.clone()) else { continue };
        let score = if rel.contains("apple-touch-icon") { 3 } else if rel.split_whitespace().any(|r| r == "icon") { 2 } else { 0 };
        if score > 0 && best_icon.as_ref().map_or(true, |(s, _)| score > *s) {
            best_icon = Some((score, resolve(&final_url, &href)));
        }
    }
    m.favicon = best_icon.map(|(_, h)| h).or_else(|| origin(&final_url).map(|o| format!("{o}/favicon.ico")));
    Ok(m)
}
