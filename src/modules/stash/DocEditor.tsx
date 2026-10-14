import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft, Bold, Check, CheckSquare, Code2, Copy, Eye, Heading1, Heading2, Italic, Link2, List, ListOrdered, Minus, MoreHorizontal,
  PenLine, Pin, PinOff, Quote, SquareCode, Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "../../lib/bridge";
import { Markdown, docStats, toggleTaskLine } from "../../lib/markdown";
import { play } from "../../lib/sound";
import { cx, timeAgo } from "../../lib/util";
import { NOTE_COLORS, collectionInWorkspace, useStash, type NoteItem } from "../../state/stash";
import { toast } from "../../state/toast";
import { useWorkspaces } from "../../state/workspaces";
import { IconButton, Menu, Popover, bouncy, spring } from "../../ui/primitives";
import { WorkspaceDot } from "../../ui/workspaces";
import { Glyph, IconPicker, InlineIcon } from "../../ui/icons";

type Fmt = { icon: React.ReactNode; label: string; run: (ta: HTMLTextAreaElement) => void };

/** Replace the textarea selection and keep React state in sync. */
function edit(ta: HTMLTextAreaElement, fn: (sel: string, before: string, after: string) => { text: string; selStart: number; selEnd: number }) {
  const { selectionStart: a, selectionEnd: b, value } = ta;
  const r = fn(value.slice(a, b), value.slice(0, a), value.slice(b));
  ta.focus();
  ta.setSelectionRange(a, b);
  // execCommand keeps the native undo stack working (Ctrl+Z).
  if (!document.execCommand("insertText", false, r.text)) ta.setRangeText(r.text, a, b, "end");
  ta.setSelectionRange(a + r.selStart, a + r.selEnd);
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}

const wrap = (mark: string, placeholder: string) => (ta: HTMLTextAreaElement) =>
  edit(ta, (sel) => {
    const body = sel || placeholder;
    return { text: `${mark}${body}${mark}`, selStart: mark.length, selEnd: mark.length + body.length };
  });

const linePrefix = (prefix: string | ((i: number) => string)) => (ta: HTMLTextAreaElement) => {
  const { value, selectionStart } = ta;
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  ta.setSelectionRange(lineStart, ta.selectionEnd);
  edit(ta, (sel) => {
    const lines = (sel || "").split("\n");
    const text = lines.map((l, i) => (typeof prefix === "string" ? prefix : prefix(i)) + l.replace(/^(#{1,3}\s|[-*]\s(\[[ xX]\]\s)?|\d+\.\s|>\s)/, "")).join("\n");
    return { text, selStart: text.length, selEnd: text.length };
  });
};

const FORMATS: Fmt[] = [
  { icon: <Heading1 size={14} />, label: "Heading", run: linePrefix("# ") },
  { icon: <Heading2 size={14} />, label: "Subheading", run: linePrefix("## ") },
  { icon: <Bold size={14} />, label: "Bold (Ctrl+B)", run: wrap("**", "bold") },
  { icon: <Italic size={14} />, label: "Italic (Ctrl+I)", run: wrap("*", "italic") },
  { icon: <Code2 size={14} />, label: "Inline code", run: wrap("`", "code") },
  { icon: <List size={14} />, label: "Bullet list", run: linePrefix("- ") },
  { icon: <ListOrdered size={14} />, label: "Numbered list", run: linePrefix((i) => `${i + 1}. `) },
  { icon: <CheckSquare size={14} />, label: "Checklist", run: linePrefix("- [ ] ") },
  { icon: <Quote size={14} />, label: "Quote", run: linePrefix("> ") },
  {
    icon: <Link2 size={14} />,
    label: "Link (Ctrl+K)",
    run: (ta) => edit(ta, (sel) => {
      const t = sel || "link text";
      return { text: `[${t}](https://)`, selStart: t.length + 3, selEnd: t.length + 11 };
    }),
  },
  { icon: <SquareCode size={14} />, label: "Code block", run: (ta) => edit(ta, (sel) => ({ text: "```\n" + (sel || "") + "\n```", selStart: 4, selEnd: 4 + sel.length })) },
  { icon: <Minus size={14} />, label: "Divider", run: (ta) => edit(ta, () => ({ text: "\n---\n", selStart: 5, selEnd: 5 })) },
];

export function DocEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const doc = useStash((s) => s.items.find((i): i is NoteItem => i.id === id && i.kind === "note"));
  const { update, remove, restore, togglePin, moveToWorkspace, moveTo, collections } = useStash();
  const workspaces = useWorkspaces((s) => s.workspaces);
  const [mode, setMode] = useState<"write" | "preview">(doc && doc.note.text.trim() ? "preview" : "write");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const ta = useRef<HTMLTextAreaElement>(null);
  const title = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!doc) onBack();
  }, [doc, onBack]);
  useEffect(() => {
    if (doc && !doc.note.title && !doc.note.text) title.current?.focus();
  }, []);
  useEffect(() => {
    if (mode === "write") requestAnimationFrame(() => ta.current?.focus());
  }, [mode]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setMode((m) => (m === "write" ? "preview" : "write"));
      }
      if (e.key === "Escape" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) && !document.querySelector("[data-popover-open]")) {
        e.stopPropagation();
        onBack();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onBack]);

  const stats = useMemo(() => docStats(doc?.note.text ?? ""), [doc?.note.text]);
  if (!doc) return null;
  const ws = workspaces.find((w) => w.id === doc.workspaceId) ?? null;

  const patch = (p: Partial<NoteItem["note"]>) => {
    update(doc.id, { note: { ...doc.note, ...p } } as Partial<NoteItem>);
    setSaved("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaved("saved"), 450);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (e.key === "Escape") {
      e.stopPropagation();
      el.blur();
      setMode("preview");
      return;
    }
    if ((e.ctrlKey || e.metaKey) && ["b", "i", "k"].includes(e.key.toLowerCase())) {
      e.preventDefault();
      FORMATS[{ b: 2, i: 3, k: 9 }[e.key.toLowerCase() as "b" | "i" | "k"]].run(el);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      edit(el, (sel) => ({ text: e.shiftKey ? sel.replace(/^ {1,2}/gm, "") : "  " + sel.replace(/\n/g, "\n  "), selStart: 2, selEnd: 2 + sel.length }));
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      // Continue bullets / numbers / checklists; Enter on an empty item ends the list.
      const { value, selectionStart } = el;
      const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const line = value.slice(lineStart, selectionStart);
      const m = line.match(/^(\s*)([-*]\s\[[ xX]\]\s|[-*]\s|(\d+)\.\s|>\s)/);
      if (!m) return;
      e.preventDefault();
      if (line.trim() === m[2].trim()) {
        el.setSelectionRange(lineStart, selectionStart);
        edit(el, () => ({ text: "", selStart: 0, selEnd: 0 }));
        return;
      }
      const next = m[3] ? `${Number(m[3]) + 1}. ` : m[2].replace(/\[[xX]\]/, "[ ]");
      edit(el, () => ({ text: `\n${m[1]}${next}`, selStart: m[1].length + next.length + 1, selEnd: m[1].length + next.length + 1 }));
    }
  };

  const copyMd = async () => {
    const md = `${doc.note.title ? `# ${doc.note.title}\n\n` : ""}${doc.note.text}`;
    try {
      if (isTauri) await writeText(md);
      else await navigator.clipboard.writeText(md);
      play("tick");
      toast("Copied as Markdown");
    } catch {
      toast("Couldn't copy", undefined, "bad");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 pb-2">
        <IconButton label="Back to stash (Esc)" size="sm" onClick={onBack}>
          <ArrowLeft size={15} />
        </IconButton>
        <Popover
          align="left"
          width={260}
          estHeight={120}
          trigger={(t) => (
            <motion.button whileHover={{ scale: 1.08, rotate: -6 }} whileTap={{ scale: 0.88 }} transition={bouncy} onClick={t} className="rounded-xl" title="Change icon">
              <Glyph name={doc.note.icon ?? "doc"} color={doc.note.color} size={30} />
            </motion.button>
          )}
        >
          {(close) => (
            <div className="p-1.5">
              <IconPicker value={doc.note.icon ?? "doc"} color={doc.note.color} onPick={(k) => (patch({ icon: k }), close())} />
            </div>
          )}
        </Popover>
        <input
          ref={title}
          value={doc.note.title}
          onChange={(e) => patch({ title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "ArrowDown") {
              e.preventDefault();
              setMode("write");
              requestAnimationFrame(() => ta.current?.focus());
            }
            if (e.key === "Escape") (e.stopPropagation(), e.currentTarget.blur());
          }}
          placeholder="Untitled doc"
          className="h-8 min-w-0 flex-1 bg-transparent font-display text-[18px] font-semibold outline-none placeholder:text-ink-4"
        />
        <AnimatePresence mode="popLayout">
          {saved !== "idle" && (
            <motion.span
              key={saved}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-1 text-[10.5px] text-ink-3"
            >
              {saved === "saved" ? (
                <>
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={bouncy} className="grid h-3.5 w-3.5 place-items-center rounded-full bg-good/80 text-black">
                    <Check size={9} strokeWidth={4} />
                  </motion.span>
                  Saved
                </>
              ) : (
                "Saving…"
              )}
            </motion.span>
          )}
        </AnimatePresence>
        <div className="flex rounded-full bg-white/6 p-0.5">
          {(["write", "preview"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              title={`${m === "write" ? "Write" : "Preview"} (Ctrl+E)`}
              className={cx("relative flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium transition-colors", mode === m ? "text-ink" : "text-ink-3 hover:text-ink-2")}
            >
              {mode === m && <motion.span layoutId="doc-mode" transition={spring} className="absolute inset-0 rounded-full bg-white/14" />}
              <span className="relative flex items-center gap-1">
                {m === "write" ? <PenLine size={11} /> : <Eye size={11} />}
                {m === "write" ? "Write" : "Read"}
              </span>
            </button>
          ))}
        </div>
        <Menu
          trigger={(open) => (
            <IconButton label="More" size="sm" onClick={open}>
              <MoreHorizontal size={15} />
            </IconButton>
          )}
          items={[
            { label: "Copy as Markdown", icon: <Copy size={13} />, onSelect: copyMd },
            { label: doc.pinned ? "Unpin" : "Pin to top", icon: doc.pinned ? <PinOff size={13} /> : <Pin size={13} />, onSelect: () => togglePin(doc.id) },
            { header: "Color" },
            ...NOTE_COLORS.map((c) => ({
              label: <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: c }} />{doc.note.color === c ? "Current" : "Use this color"}</span>,
              onSelect: () => patch({ color: c }),
            })),
            { header: "Folder" },
            ...workspaces.map((w) => ({
              label: w.name,
              icon: <InlineIcon name={w.icon} color={w.color} />,
              hint: doc.workspaceId === w.id ? <Check size={12} /> : undefined,
              onSelect: () => (moveToWorkspace(doc.id, w.id), toast(`Moved to ${w.name}`)),
            })),
            { header: "Subfolder" },
            ...collections
              .filter((c) => collectionInWorkspace(c, doc.workspaceId ?? "all"))
              .map((c) => ({
                label: c.name,
                icon: <InlineIcon name={c.icon} color={c.color} />,
                hint: doc.collectionId === c.id ? <Check size={12} /> : undefined,
                onSelect: () => moveTo(doc.id, doc.collectionId === c.id ? null : c.id) })),
            "sep",
            {
              label: "Delete doc",
              icon: <Trash2 size={13} />,
              danger: true,
              onSelect: () => {
                const it = remove(doc.id);
                onBack();
                if (it) toast(`Deleted “${doc.note.title || "Untitled"}”`, { label: "Undo", run: () => restore(it) });
              },
            },
          ]}
        />
      </div>

      <AnimatePresence initial={false}>
        {mode === "write" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="mb-2 flex items-center gap-0.5 rounded-xl bg-white/[0.04] p-0.5">
              {FORMATS.map((f, i) => (
                <motion.button
                  key={f.label}
                  title={f.label}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.015 }}
                  whileHover={{ y: -1.5 }}
                  whileTap={{ scale: 0.82 }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => ta.current && f.run(ta.current)}
                  className="grid h-7 w-7 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-white/10 hover:text-ink"
                >
                  {f.icon}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="scroll fade-y relative min-h-0 flex-1 rounded-2xl px-3 py-2"
        style={{ background: `color-mix(in oklab, ${doc.note.color} 6%, rgb(255 255 255 / 0.03))` }}
        onDoubleClick={() => mode === "preview" && setMode("write")}
      >
        <AnimatePresence mode="wait" initial={false}>
          {mode === "write" ? (
            <motion.textarea
              key="w"
              ref={ta}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              value={doc.note.text}
              onChange={(e) => patch({ text: e.target.value })}
              onKeyDown={onKeyDown}
              spellCheck
              placeholder={"Start writing…\n\n# Headings, **bold**, - lists, - [ ] checklists, ``` code ```\nCtrl+E to preview."}
              className="block h-full min-h-full w-full resize-none bg-transparent text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-ink-4"
            />
          ) : (
            <motion.div key="p" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="clickable min-h-full">
              {doc.note.text.trim() ? (
                <Markdown source={doc.note.text} onToggleTask={(line) => (patch({ text: toggleTaskLine(doc.note.text, line) }), play("tick"))} />
              ) : (
                <div className="pt-6 text-center text-[12px] text-ink-4">Empty doc — double-click to start writing</div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-3 pt-2 text-[10.5px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <WorkspaceDot ws={ws} size={15} />
          {ws?.name ?? "Shared"}
        </span>
        <span>{stats.words} words · {stats.minutes} min read</span>
        {stats.tasks > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="h-1 w-14 overflow-hidden rounded-full bg-white/10">
              <motion.span className="block h-full rounded-full bg-good" animate={{ width: `${(stats.done / stats.tasks) * 100}%` }} transition={spring} />
            </span>
            {stats.done}/{stats.tasks}
          </span>
        )}
        <span className="ml-auto">Edited {timeAgo(doc.updatedAt)}</span>
      </div>
    </div>
  );
}
