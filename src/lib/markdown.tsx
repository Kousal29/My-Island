import type { ReactNode } from "react";
import { api } from "./bridge";

/**
 * Small, safe Markdown renderer for docs (React elements only, never innerHTML).
 * Blocks: # headings, - / * / 1. lists, - [ ] checklists, > quotes, ``` code, ---, paragraphs.
 * Inline: **bold**, *italic*, `code`, ~~strike~~, [text](url), bare URLs.
 */

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|~~[^~]+~~|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s)]+)/g;

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (/^https?:\/\//i.test(href) || href.startsWith("mailto:")) void api.openUrl(href);
      }}
      className="text-[var(--accent-ink)] underline decoration-[var(--accent)]/40 underline-offset-2 hover:decoration-[var(--accent)]"
    >
      {children}
    </a>
  );
}

export function inline(text: string, keyBase = ""): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const t = m[0];
    if (m.index! > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k} className="font-semibold text-ink">{inline(t.slice(2, -2), k)}</strong>);
    else if (t.startsWith("~~")) out.push(<s key={k} className="text-ink-3">{t.slice(2, -2)}</s>);
    else if (t.startsWith("`")) out.push(<code key={k} className="rounded-md bg-white/9 px-1 py-[1px] font-mono text-[0.88em] text-[#ffd7a8]">{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const mm = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!;
      out.push(<Link key={k} href={mm[2]}>{mm[1]}</Link>);
    } else if (t.startsWith("http")) out.push(<Link key={k} href={t}>{t.replace(/^https?:\/\/(www\.)?/, "")}</Link>);
    else out.push(<em key={k}>{inline(t.slice(1, -1), k)}</em>);
    last = m.index! + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export interface MdOptions {
  /** Called with the source line index of a checklist item when it's toggled. */
  onToggleTask?: (line: number) => void;
}

export function Markdown({ source, onToggleTask }: { source: string } & MdOptions) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    const k = key++;

    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      blocks.push(
        <div key={k} className="relative my-2 overflow-hidden rounded-xl bg-black/40 ring-1 ring-white/8">
          {lang && <div className="absolute top-1 right-2 text-[9.5px] tracking-wide text-ink-4 uppercase">{lang}</div>}
          <pre className="overflow-x-auto p-3 font-mono text-[11.5px] leading-relaxed text-[#d7e3ff]">{body.join("\n")}</pre>
        </div>,
      );
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const size = ["text-[18px] mt-3", "text-[15px] mt-2.5", "text-[13.5px] mt-2"][h[1].length - 1];
      blocks.push(<div key={k} className={`mb-1 font-display font-semibold text-ink ${size}`}>{inline(h[2], `h${k}`)}</div>);
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push(<hr key={k} className="my-3 border-white/10" />);
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(
        <blockquote key={k} className="my-1.5 border-l-2 border-[var(--accent)]/60 pl-3 text-ink-2 italic">
          {inline(body.join(" "), `q${k}`)}
        </blockquote>,
      );
      continue;
    }

    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items: ReactNode[] = [];
      const ordered = /^\s*\d+\./.test(line);
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const li = lines[i];
        const idx = i;
        const indent = (li.match(/^\s*/)?.[0].length ?? 0) >= 2;
        const task = li.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
        if (task) {
          const done = task[1].toLowerCase() === "x";
          items.push(
            <li key={idx} className={`flex items-start gap-2 ${indent ? "ml-5" : ""}`}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleTask?.(idx);
                }}
                className={`mt-[3px] grid h-[14px] w-[14px] shrink-0 place-items-center rounded-[4px] border transition-all ${done ? "border-[var(--accent)] bg-[var(--accent)]" : "border-white/30 hover:border-white/60"}`}
              >
                {done && (
                  <svg viewBox="0 0 12 12" className="h-2.5 w-2.5">
                    <path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" stroke="#000" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <span className={done ? "text-ink-3 line-through" : ""}>{inline(task[2], `t${idx}`)}</span>
            </li>,
          );
        } else {
          const text = li.replace(/^\s*([-*]|\d+\.)\s+/, "");
          const marker = ordered ? `${li.match(/\d+/)![0]}.` : "•";
          items.push(
            <li key={idx} className={`flex gap-2 ${indent ? "ml-5" : ""}`}>
              <span className="w-3 shrink-0 text-right text-ink-3">{marker}</span>
              <span>{inline(text, `l${idx}`)}</span>
            </li>,
          );
        }
        i++;
      }
      blocks.push(<ul key={k} className="my-1 space-y-0.5">{items}</ul>);
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|```|>|\s*([-*]|\d+\.)\s+|-{3,}\s*$)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={k} className="my-1 leading-relaxed">{inline(para.join(" "), `p${k}`)}</p>);
  }

  return <div className="text-[12.5px] text-ink-2">{blocks}</div>;
}

export function toggleTaskLine(source: string, line: number) {
  const lines = source.split("\n");
  lines[line] = lines[line].replace(/\[([ xX])\]/, (_, c) => (c === " " ? "[x]" : "[ ]"));
  return lines.join("\n");
}

export function docStats(text: string) {
  const words = (text.match(/\S+/g) ?? []).length;
  const tasks = (text.match(/^\s*[-*]\s+\[[ xX]\]/gm) ?? []).length;
  const done = (text.match(/^\s*[-*]\s+\[[xX]\]/gm) ?? []).length;
  return { words, minutes: Math.max(1, Math.round(words / 220)), tasks, done };
}

/** First meaningful line, stripped of markdown, for list previews. */
export function plainPreview(text: string, max = 120) {
  const line = text.split("\n").map((l) => l.replace(/^#+\s*|^[-*]\s+(\[[ xX]\]\s+)?|^>\s*|[*_`~]/g, "").trim()).find(Boolean) ?? "";
  return line.slice(0, max);
}
