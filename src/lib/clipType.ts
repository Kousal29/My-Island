export type ClipType = "text" | "url" | "email" | "color" | "code" | "number" | "path" | "phone" | "json";

export function detectClipType(raw: string): ClipType {
  const t = raw.trim();
  if (/^https?:\/\/\S+$/i.test(t)) return "url";
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(t)) return "email";
  if (/^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\([^)]*\)|hsla?\([^)]*\))$/i.test(t)) return "color";
  if (/^[a-z]:\\|^\\\\[\w.-]+\\/i.test(t) && !t.includes("\n")) return "path";
  if (/^\+?[\d\s().-]{7,}$/.test(t) && /\d{3}/.test(t)) return "phone";
  if (/^-?[\d,]+(\.\d+)?$/.test(t)) return "number";
  if (/^[[{]/.test(t)) {
    try {
      JSON.parse(t);
      return "json";
    } catch {}
  }
  const codeHints = /[;{}]\s*$|^\s*(const|let|var|function|import|export|def|class|fn|pub|if|for|while|return|SELECT|<\w+)/m;
  if (t.includes("\n") && codeHints.test(t)) return "code";
  return "text";
}
