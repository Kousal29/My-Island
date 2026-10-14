import { convertFileSrc } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle, Archive, Check, ClipboardList, Code2, Copy, ExternalLink, File, FileArchive, FileAudio, FileCode2, FileImage, FileSpreadsheet,
  FileText, FileVideo, Folder, FolderOpen, FolderPlus, Hash, Link2, Mail, MoreHorizontal, Palette, Phone, Pin, PinOff, Plus, RefreshCw, Search,
  Trash2, Type, X, FileText as DocIcon,
  FileDown,
  Paperclip, FilePlus2,
  ChevronRight, Folders, FolderTree,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, isTauri } from "../../lib/bridge";
import { bus } from "../../lib/bus";
import type { ClipType } from "../../lib/clipType";
import { play } from "../../lib/sound";
import { cx, formatBytes, fuzzyScore, hostOf, timeAgo } from "../../lib/util";
import { useIsland } from "../../state/island";
import { useSettings } from "../../state/settings";
import { collectionInWorkspace, itemSearchText, itemTitle, stashInWorkspace, useStash, type ClipItem, type FileItem, type LinkItem, type NoteItem, type StashFilter, type StashItem } from "../../state/stash";
import { ALL, useCurrentWorkspace, useWorkspaces } from "../../state/workspaces";
import { DOC_TEMPLATES } from "../../lib/docTemplates";
import { docStats, plainPreview } from "../../lib/markdown";
import { DocEditor } from "./DocEditor";
import { WorkspaceDot } from "../../ui/workspaces";
import { Glyph, InlineIcon } from "../../ui/icons";
import { toast } from "../../state/toast";
import { Chip, Empty, HScroll, IconButton, Menu, bouncy, spring } from "../../ui/primitives";
import type { IslandModule } from "../types";

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "ico"]);

function fileVisual(ext: string, isDir: boolean) {
  if (isDir) return { Icon: Folder, color: "#ffc94a" };
  if (IMAGE_EXT.has(ext)) return { Icon: FileImage, color: "#ff8fb8" };
  if (["mp4", "mov", "mkv", "avi", "webm"].includes(ext)) return { Icon: FileVideo, color: "#b18cff" };
  if (["mp3", "wav", "flac", "m4a", "ogg"].includes(ext)) return { Icon: FileAudio, color: "#3fe0b0" };
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return { Icon: FileArchive, color: "#ff9f6e" };
  if (["xlsx", "xls", "csv", "numbers"].includes(ext)) return { Icon: FileSpreadsheet, color: "#4ade80" };
  if (["js", "ts", "tsx", "jsx", "rs", "py", "go", "java", "c", "cpp", "cs", "json", "html", "css", "md", "yml", "yaml", "toml", "sh", "ps1"].includes(ext))
    return { Icon: FileCode2, color: "#4fb4ff" };
  if (["pdf", "doc", "docx", "txt", "rtf", "pages", "ppt", "pptx", "key"].includes(ext)) return { Icon: FileText, color: "#ff6b7d" };
  return { Icon: File, color: "rgb(255 255 255 / 0.55)" };
}

const CLIP_ICON: Record<ClipType, typeof Type> = {
  text: Type, url: Link2, email: Mail, color: Palette, code: Code2, number: Hash, path: FolderOpen, phone: Phone, json: Code2,
};

async function copy(text: string, id?: string) {
  try {
    if (isTauri) await writeText(text);
    else await navigator.clipboard.writeText(text);
    if (id) useStash.getState().touch(id);
    bus.emit("clip:copied", { text });
    play("tick");
    return true;
  } catch {
    toast("Couldn't copy to clipboard", undefined, "bad");
    return false;
  }
}

function ItemMenu({ item }: { item: StashItem }) {
  const { togglePin, remove, restore, moveTo, collections, addNote, refreshLink, moveToWorkspace } = useStash();
  const workspaces = useWorkspaces((s) => s.workspaces);
  return (
    <Menu
      trigger={(open) => (
        <IconButton label="More" size="sm" onClick={(e) => (e.stopPropagation(), open())}>
          <MoreHorizontal size={14} />
        </IconButton>
      )}
      items={[
        { label: item.pinned ? "Unpin" : "Pin to top", icon: item.pinned ? <PinOff size={13} /> : <Pin size={13} />, onSelect: () => togglePin(item.id) },
        item.kind === "file" && { label: "Show in Explorer", icon: <FolderOpen size={13} />, onSelect: () => void api.revealPath(item.file.path) },
        item.kind === "file" && { label: "Copy path", icon: <Copy size={13} />, onSelect: () => void copy(item.file.path) },
        item.kind === "link" && { label: "Copy link", icon: <Copy size={13} />, onSelect: () => void copy(item.link.url) },
        item.kind === "link" && { label: "Refresh preview", icon: <RefreshCw size={13} />, onSelect: () => void refreshLink(item.id) },
        item.kind === "clip" && { label: "Save as doc", icon: <DocIcon size={13} />, onSelect: () => (addNote(item.clip.text), toast("Saved as doc")) },
        { header: "Move to folder" },
        ...workspaces.map((w) => ({
          label: w.name,
          icon: <InlineIcon name={w.icon} color={w.color} />,
          hint: item.workspaceId === w.id ? <Check size={12} /> : undefined,
          onSelect: () => (moveToWorkspace(item.id, w.id), toast(`Moved to ${w.name}`)),
        })),
        { header: "Subfolder" },
        ...collections.filter((c) => collectionInWorkspace(c, item.workspaceId ?? ALL)).map((c) => ({
          label: c.name,
          icon: <InlineIcon name={c.icon} color={c.color} />,
          hint: item.collectionId === c.id ? <Check size={12} /> : undefined,
          onSelect: () => moveTo(item.id, item.collectionId === c.id ? null : c.id),
        })),
        "sep",
        {
          label: "Delete",
          icon: <Trash2 size={13} />,
          danger: true,
          onSelect: () => {
            const it = remove(item.id);
            if (it) toast(`Removed “${itemTitle(it).slice(0, 26)}”`, { label: "Undo", run: () => restore(it) });
          },
        },
      ]}
    />
  );
}

function Row({ item, onClick, icon, title, subtitle, aside }: { item: StashItem; onClick: () => void; icon: React.ReactNode; title: React.ReactNode; subtitle?: React.ReactNode; aside?: React.ReactNode }) {
  const collection = useStash((s) => s.collections.find((c) => c.id === item.collectionId));
  const showWs = useWorkspaces((s) => s.current === ALL);
  const ws = useWorkspaces((s) => s.workspaces.find((w) => w.id === item.workspaceId) ?? null);
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
      transition={spring}
      onClick={onClick}
      whileTap={{ scale: 0.985 }}
      className="clickable group flex items-center gap-3 rounded-2xl px-2 py-1.5 transition-colors hover:bg-white/6 active:bg-white/9"
    >
      <div className="relative shrink-0">
        {icon}
        {item.pinned && (
          <span className="absolute -top-1 -right-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-[var(--accent)] text-black">
            <Pin size={8} strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium text-ink">{title}</div>
        <div className="flex items-center gap-1.5 truncate text-[10.5px] text-ink-3">
          {showWs && ws && <WorkspaceDot ws={ws} size={14} />}
          {collection && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-[1px]" style={{ background: `color-mix(in oklab, ${collection.color} 18%, transparent)`, color: collection.color }}>
              <InlineIcon name={collection.icon} size={10} />
              {collection.name}
            </span>
          )}
          <span className="truncate">{subtitle}</span>
        </div>
      </div>
      {aside}
      <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
        <IconButton
          label={item.pinned ? "Unpin" : "Pin"}
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            useStash.getState().togglePin(item.id);
          }}
        >
          {item.pinned ? <PinOff size={13} /> : <Pin size={13} />}
        </IconButton>
        <ItemMenu item={item} />
      </div>
    </motion.div>
  );
}

function FileRow({ item }: { item: FileItem }) {
  const { file } = item;
  const { Icon, color } = fileVisual(file.ext, file.isDir);
  const img = IMAGE_EXT.has(file.ext) && file.exists && isTauri;
  const folder = file.path.split(/[\\/]/).slice(-2, -1)[0] ?? "";
  return (
    <Row
      item={item}
      onClick={() => {
        if (!file.exists) return toast("File not found — it may have moved", undefined, "bad");
        useStash.getState().touch(item.id);
        void api.openPath(file.path);
      }}
      icon={
        img ? (
          <img src={convertFileSrc(file.path)} draggable={false} className="h-9 w-9 rounded-xl object-cover ring-1 ring-white/10" />
        ) : (
          <div className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}>
            <Icon size={17} />
          </div>
        )
      }
      title={file.name}
      subtitle={
        file.exists ? (
          <>
            {file.isDir ? "Folder" : `${file.ext.toUpperCase() || "File"} · ${formatBytes(file.size)}`} · {folder}
          </>
        ) : (
          <span className="inline-flex items-center gap-1 text-warn">
            <AlertTriangle size={10} /> Missing — {file.path}
          </span>
        )
      }
    />
  );
}

function Favicon({ src, size = 36 }: { src?: string; size?: number }) {
  const [ok, setOk] = useState(true);
  return (
    <div className="grid place-items-center overflow-hidden rounded-xl bg-white/90" style={{ width: size, height: size }}>
      {src && ok ? <img src={src} onError={() => setOk(false)} draggable={false} className="h-5 w-5 object-contain" /> : <Link2 size={16} className="text-[#333]" />}
    </div>
  );
}

function LinkRow({ item }: { item: LinkItem }) {
  const { link } = item;
  const m = link.meta;
  const previews = useSettings((s) => s.linkPreviews);
  return (
    <Row
      item={item}
      onClick={() => {
        useStash.getState().touch(item.id);
        void api.openUrl(link.url);
      }}
      icon={previews ? <Favicon src={m?.favicon} /> : <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#4fb4ff]/16 text-[#4fb4ff]"><Link2 size={16} /></div>}
      title={link.status === "loading" && !m?.title ? <span className="skeleton inline-block h-3 w-40 rounded" /> : m?.title || hostOf(link.url)}
      subtitle={
        <>
          {m?.siteName || hostOf(link.url)}
          {m?.description ? ` · ${m.description}` : ""}
        </>
      }
      aside={
        <div className="flex items-center gap-2">
          {previews && m?.image && <img src={m.image} draggable={false} onError={(e) => (e.currentTarget.style.display = "none")} className="hidden h-9 w-14 rounded-lg object-cover ring-1 ring-white/10 sm:block" />}
          <ExternalLink size={12} className="text-ink-4 opacity-0 transition group-hover:opacity-100" />
        </div>
      }
    />
  );
}

function ClipRow({ item }: { item: ClipItem }) {
  const { clip } = item;
  const [copied, setCopied] = useState(false);
  const Icon = CLIP_ICON[clip.type];
  const preview = clip.text.trim().replace(/\s+/g, " ");
  const lines = clip.text.split("\n").length;
  return (
    <Row
      item={item}
      onClick={async () => {
        if (await copy(clip.text, item.id)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }
      }}
      icon={
        clip.type === "color" ? (
          <div className="h-9 w-9 rounded-xl ring-1 ring-white/15" style={{ background: clip.text.trim() }} />
        ) : (
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/7 text-ink-2">
            <Icon size={16} />
          </div>
        )
      }
      title={<span className={cx(clip.type === "code" || clip.type === "json" ? "font-mono text-[11.5px]" : "")}>{preview.slice(0, 140)}</span>}
      subtitle={
        <>
          {clip.type !== "text" ? clip.type.toUpperCase() + " · " : ""}
          {lines > 1 ? `${lines} lines · ` : ""}
          {clip.text.length > 60 ? `${clip.text.length} chars · ` : ""}
          {timeAgo(item.updatedAt)}
        </>
      }
      aside={
        <AnimatePresence>
          {copied && (
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              className="inline-flex items-center gap-1 rounded-full bg-good/16 px-2 py-0.5 text-[10.5px] font-semibold text-good"
            >
              <Check size={11} strokeWidth={3} /> Copied
            </motion.span>
          )}
        </AnimatePresence>
      }
    />
  );
}

function DocCard({ item, onOpen }: { item: NoteItem; onOpen: (id: string) => void }) {
  const c = item.note.color;
  const st = docStats(item.note.text);
  const showWs = useWorkspaces((s) => s.current === ALL);
  const ws = useWorkspaces((s) => s.workspaces.find((w) => w.id === item.workspaceId) ?? null);
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 20, transition: { duration: 0.15 } }}
      transition={spring}
      className="clickable group relative flex items-center gap-3 rounded-2xl bg-white/[0.035] px-2.5 py-2 ring-1 ring-white/[0.05] transition-colors hover:bg-white/[0.065]"
      onClick={() => onOpen(item.id)}
    >
      <motion.div whileHover={{ rotate: -6 }} transition={bouncy}>
        <Glyph name={item.note.icon ?? "doc"} color={c} size={34} />
      </motion.div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-semibold text-ink">{item.note.title || plainPreview(item.note.text, 60) || "Untitled doc"}</span>
          {item.pinned && <Pin size={10} className="shrink-0 text-[var(--accent-ink)]" />}
        </div>
        <div className="truncate text-[11px] text-ink-3">{item.note.title ? plainPreview(item.note.text) || "Empty doc" : `${st.words} words`}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-ink-4">
          {showWs && ws && (
            <span className="flex items-center gap-1">
              <WorkspaceDot ws={ws} size={12} />
              {ws.name}
            </span>
          )}
          <span>{st.words} words</span>
          {st.tasks > 0 && (
            <span className="inline-flex items-center gap-1">
              <Check size={10} /> {st.done}/{st.tasks}
            </span>
          )}
          <span>{timeAgo(item.updatedAt)}</span>
        </div>
      </div>
      <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
        <IconButton label="Copy text" size="sm" onClick={() => void copy(item.note.text, item.id)}>
          <Copy size={12} />
        </IconButton>
        <ItemMenu item={item} />
      </div>
    </motion.div>
  );
}

function StashItemView({ item, onOpenDoc }: { item: StashItem; onOpenDoc: (id: string) => void }) {
  switch (item.kind) {
    case "file": return <FileRow item={item} />;
    case "link": return <LinkRow item={item} />;
    case "clip": return <ClipRow item={item} />;
    case "note": return <DocCard item={item} onOpen={onOpenDoc} />;
  }
}

/** Native file/folder picker → stash (paths only; files stay where they are). */
async function pickAndStash(directory: boolean) {
  if (!isTauri) return;
  const picked = await openDialog({ multiple: true, directory, title: directory ? "Add a folder to your stash" : "Add files to your stash" });
  const paths = picked === null ? [] : Array.isArray(picked) ? picked : [picked];
  if (!paths.length) return;
  const n = await useStash.getState().addFiles(paths);
  play(n ? "success" : "tick");
  toast(n ? `Added ${n} ${directory ? "folder" : "file"}${n > 1 ? "s" : ""}` : "Already in your stash");
}

function Composer({ searchRef, query, setQuery, onNewDoc }: { searchRef: React.RefObject<HTMLInputElement | null>; query: string; setQuery: (q: string) => void; onNewDoc: (template: string) => void }) {
  const { addLink, addNote } = useStash();
  const [mode, setMode] = useState<"search" | "add">("add");
  const [text, setText] = useState("");
  const isUrl = /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(text.trim());

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    if (isUrl) addLink(t);
    else addNote(t);
    play("pop");
    setText("");
  };

  return (
    <div className="flex h-10 items-center gap-2 rounded-2xl bg-white/[0.055] pr-1 pl-3 ring-1 ring-white/[0.06] transition focus-within:bg-white/[0.08] focus-within:ring-[var(--accent)]/45">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={mode + String(isUrl)} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} className="text-ink-3">
            {mode === "search" ? <Search size={15} /> : isUrl ? <Link2 size={15} /> : <Plus size={15} />}
          </motion.span>
        </AnimatePresence>
        {mode === "search" ? (
          <input
            ref={searchRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setQuery("");
                setMode("add");
              }
            }}
            placeholder="Search everything you've saved…"
            className="h-full min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-ink-4"
          />
        ) : (
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape" && text) {
                e.stopPropagation();
                setText("");
              }
            }}
            placeholder="Paste a link or jot a quick note… (drop files anywhere)"
            className="h-full min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-ink-4"
          />
        )}
        {mode === "add" && text.trim() && (
          <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} onClick={submit} className="h-6 rounded-full bg-[var(--accent)] px-2.5 text-[11px] font-semibold text-black">
            {isUrl ? "Save link" : "Save as doc"}
          </motion.button>
        )}
      <div className="mx-0.5 h-4 w-px shrink-0 bg-white/10" />
      <Menu
        trigger={(open) => (
          <button onClick={open} title="Add files or a folder" aria-label="Add files or a folder" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-white/10 hover:text-ink">
            <Paperclip size={14} />
          </button>
        )}
        items={[
          { label: "Add files…", icon: <FilePlus2 size={13} />, onSelect: () => void pickAndStash(false) },
          { label: "Add a folder…", icon: <FolderPlus size={13} />, onSelect: () => void pickAndStash(true) },
        ]}
      />
      <Menu
        trigger={(open) => (
          <button onClick={open} title="New doc (Ctrl+N)" aria-label="New doc" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-white/10 hover:text-ink">
            <FilePlus2 size={14} />
          </button>
        )}
        items={[
          { header: "New doc from template" },
          ...DOC_TEMPLATES.map((t) => ({ label: t.label, icon: <InlineIcon name={t.icon} />, onSelect: () => onNewDoc(t.id) })),
        ]}
      />
      <button
        title={mode === "search" ? "Close search (Esc)" : "Search (Ctrl+F)"}
        aria-label="Search"
        onClick={() => {
          setMode(mode === "search" ? "add" : "search");
          setQuery("");
        }}
        className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-white/10 hover:text-ink", mode === "search" && "bg-white/12 text-ink")}
      >
        {mode === "search" ? <X size={14} /> : <Search size={14} />}
      </button>
      <SearchHotkey onOpen={() => setMode("search")} />
    </div>
  );
}

function SearchHotkey({ onOpen }: { onOpen: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onOpen]);
  return null;
}

function CollectionPicker() {
  const { collections: all, collection, setCollection, addCollection, removeCollection, items } = useStash();
  const ws = useWorkspaces((s) => s.current);
  const collections = all.filter((c) => collectionInWorkspace(c, ws));
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const current = collections.find((c) => c.id === collection);
  if (naming) {
    return (
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => setNaming(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim()) {
            setCollection(addCollection(name.trim()));
            setName("");
            setNaming(false);
          }
          if (e.key === "Escape") {
            e.stopPropagation();
            setNaming(false);
          }
        }}
        placeholder="Subfolder name"
        className="h-7 w-32 rounded-full bg-white/8 px-2.5 text-[12px] outline-none"
      />
    );
  }
  return (
    <Menu
      trigger={(open) => (
        <button
          onClick={open}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-white/6 px-2.5 text-[12px] font-medium text-ink-2 hover:bg-white/10"
          style={current ? { color: current.color, background: `color-mix(in oklab, ${current.color} 16%, transparent)` } : undefined}
        >
          {current ? <><InlineIcon name={current.icon} size={12} /> {current.name}</> : <><FolderTree size={12} /> Subfolders</>}
        </button>
      )}
      items={[
        { label: "Whole folder", icon: <Archive size={13} />, onSelect: () => setCollection(null) },
        "sep",
        ...collections.map((c) => ({
          label: (
            <span className="flex w-full justify-between gap-4">
              <span className="flex items-center gap-2"><InlineIcon name={c.icon} color={c.color} /> {c.name}</span>
              <span className="text-ink-4">{items.filter((i) => i.collectionId === c.id).length}</span>
            </span>
          ),
          onSelect: () => setCollection(c.id),
        })),
        "sep",
        { label: "New subfolder", icon: <FolderPlus size={13} />, onSelect: () => setNaming(true) },
        current && { label: `Delete “${current.name}”`, icon: <Trash2 size={13} />, danger: true, onSelect: () => removeCollection(current.id) },
      ]}
    />
  );
}

const FILTERS: { id: StashFilter; label: string; icon: React.ReactNode }[] = [
  { id: "all", label: "All", icon: null },
  { id: "pinned", label: "Pinned", icon: <Pin size={11} /> },
  { id: "file", label: "Files", icon: <File size={11} /> },
  { id: "link", label: "Links", icon: <Link2 size={11} /> },
  { id: "clip", label: "Clipboard", icon: <ClipboardList size={11} /> },
  { id: "note", label: "Docs", icon: <DocIcon size={11} /> },
];

/** All folders › Work › Docs — every part is clickable. */
function Breadcrumb() {
  const { workspaces, current, setCurrent } = useWorkspaces();
  const { collection, setCollection, collections } = useStash();
  const ws = workspaces.find((w) => w.id === current) ?? null;
  const sub = collections.find((c) => c.id === collection) ?? null;
  const crumb = (label: React.ReactNode, onClick: (() => void) | null, key: string) => (
    <motion.button
      key={key}
      layout="position"
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      disabled={!onClick}
      onClick={onClick ?? undefined}
      className={cx(
        "flex h-7 min-w-0 items-center gap-1.5 rounded-lg px-1.5 text-[12.5px] transition-colors",
        onClick ? "text-ink-3 hover:bg-white/6 hover:text-ink" : "font-semibold text-ink",
      )}
    >
      {label}
    </motion.button>
  );
  const sep = (k: string) => <ChevronRight key={k} size={12} className="shrink-0 text-ink-4" />;
  return (
    <div className="flex max-w-[45%] min-w-0 shrink-0 items-center gap-0.5">
      {crumb(
        <>
          <Folders size={14} /> {ws ? "" : "All folders"}
        </>,
        ws ? () => (setCurrent(ALL), setCollection(null)) : null,
        "all",
      )}
      {ws && sep("s1")}
      {ws &&
        crumb(
          <>
            <WorkspaceDot ws={ws} size={16} /> <span className="truncate">{ws.name}</span>
          </>,
          sub ? () => setCollection(null) : null,
          "ws",
        )}
      {sub && sep("s2")}
      {sub &&
        crumb(
          <>
            <InlineIcon name={sub.icon} color={sub.color} size={12} /> <span className="truncate">{sub.name}</span>
          </>,
          null,
          "sub",
        )}
    </div>
  );
}

function FolderGrid() {
  const { workspaces, setCurrent, create } = useWorkspaces();
  const items = useStash((s) => s.items);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((i) => i.workspaceId && m.set(i.workspaceId, (m.get(i.workspaceId) ?? 0) + 1));
    return m;
  }, [items]);
  return (
    <div className="mb-2 grid grid-cols-3 gap-1.5">
      {workspaces.map((w, i) => (
        <motion.button
          key={w.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => {
            setCurrent(w.id);
            play("tick");
          }}
          className="flex items-center gap-2.5 rounded-2xl bg-white/[0.045] p-2.5 text-left ring-1 ring-white/[0.05] transition-colors hover:bg-white/[0.08]"
        >
          <Glyph name={w.icon} color={w.color} size={30} />
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-semibold text-ink">{w.name}</span>
            <span className="block text-[10.5px] text-ink-3">{counts.get(w.id) ?? 0} items</span>
          </span>
        </motion.button>
      ))}
      <motion.button
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.96 }}
        onClick={() => {
          const w = create("New folder");
          useIsland.getState().set({ settingsOpen: true, settingsSection: "workspaces" });
          toast(`Created “${w.name}” — rename it in Folders`);
        }}
        className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-white/12 p-2.5 text-[12px] text-ink-3 hover:border-white/25 hover:text-ink-2"
      >
        <FolderPlus size={15} /> New folder
      </motion.button>
    </div>
  );
}

const GROUPS: { id: StashFilter; label: string; icon: React.ReactNode; match: (i: StashItem) => boolean }[] = [
  { id: "pinned", label: "Pinned", icon: <Pin size={11} />, match: (i) => i.pinned },
  { id: "note", label: "Docs", icon: <DocIcon size={11} />, match: (i) => !i.pinned && i.kind === "note" },
  { id: "file", label: "Files", icon: <File size={11} />, match: (i) => !i.pinned && i.kind === "file" },
  { id: "link", label: "Links", icon: <Link2 size={11} />, match: (i) => !i.pinned && i.kind === "link" },
  { id: "clip", label: "Clipboard", icon: <ClipboardList size={11} />, match: (i) => !i.pinned && i.kind === "clip" },
];

/** "All" view: tidy sections (Pinned, Docs, Files, Links, Clipboard), 4 items each + "See all". */
function GroupedList({ items, onOpenDoc, onSeeAll }: { items: StashItem[]; onOpenDoc: (id: string) => void; onSeeAll: (f: StashFilter) => void }) {
  return (
    <div className="space-y-3">
      {GROUPS.map((g) => {
        const list = items.filter(g.match);
        if (!list.length) return null;
        return (
          <section key={g.id}>
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
                {g.icon}
                {g.label}
                <span className="tabular font-medium text-ink-4">{list.length}</span>
              </span>
              {list.length > 4 && (
                <button onClick={() => onSeeAll(g.id)} className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10.5px] text-ink-3 hover:bg-white/6 hover:text-ink">
                  See all <ChevronRight size={11} />
                </button>
              )}
            </div>
            <div className="space-y-0.5">
              <AnimatePresence initial={false} mode="popLayout">
                {list.slice(0, 4).map((i) => (
                  <StashItemView key={i.id} item={i} onOpenDoc={onOpenDoc} />
                ))}
              </AnimatePresence>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function StashView() {
  const { items: allItems, filter, setFilter, collection, setCollection, collections, clearClips, refreshFiles, addNote } = useStash();
  const ws = useWorkspaces((s) => s.current);
  const curWs = useCurrentWorkspace();
  const items = useMemo(() => allItems.filter((i) => stashInWorkspace(i, ws)), [allItems, ws]);
  const [editing, setEditing] = useState<string | null>(null);
  const route = useIsland((s) => s.route);
  const dragging = useIsland((s) => s.dragging);
  const dragKind = useIsland((s) => s.dragKind);
  const dragCount = useIsland((s) => s.dragCount);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(60);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (route === "clips") setFilter("clip");
    if (route === "files") setFilter("file");
    if (route === "links") setFilter("link");
  }, [route, setFilter]);
  useEffect(() => void refreshFiles(), [refreshFiles]);
  useEffect(() => {
    const c = collections.find((x) => x.id === collection);
    if (c && !collectionInWorkspace(c, ws)) setCollection(null);
  }, [ws, collection, collections, setCollection]);

  const newDoc = useCallback(
    (templateId: string) => {
      const t = DOC_TEMPLATES.find((x) => x.id === templateId) ?? DOC_TEMPLATES[0];
      const d = addNote(t.body(), t.title);
      useStash.getState().update(d.id, { note: { ...d.note, icon: t.icon } } as Partial<NoteItem>);
      play("pop");
      setEditing(d.id);
    },
    [addNote],
  );
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        newDoc("blank");
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [newDoc]);
  const closeDoc = useCallback(() => setEditing(null), []);

  const counts = useMemo(() => {
    const scoped = collection ? items.filter((i) => i.collectionId === collection) : items;
    const c: Record<string, number> = { all: scoped.length, pinned: scoped.filter((i) => i.pinned).length };
    scoped.forEach((i) => (c[i.kind] = (c[i.kind] ?? 0) + 1));
    return c;
  }, [items, collection]);

  const visible = useMemo(() => {
    let list = items.filter((i) => (!collection || i.collectionId === collection) && (filter === "all" || (filter === "pinned" ? i.pinned : i.kind === filter)));
    if (query.trim()) {
      return list
        .map((i) => ({ i, s: fuzzyScore(itemSearchText(i), query) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.i);
    }
    return list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  }, [items, filter, collection, query]);

  const shown = visible.slice(0, limit);

  if (editing) {
    return (
      <motion.div key="editor" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={spring} className="h-full">
        <DocEditor id={editing} onBack={closeDoc} />
      </motion.div>
    );
  }

  return (
    <motion.div key="list" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={spring} className="relative flex h-full flex-col gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <Breadcrumb />
        <div className="h-4 w-px shrink-0 bg-white/10" />
        <HScroll className="flex-1" watch={filter}>
          {FILTERS.map((f) => (
            <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)} layoutGroup="stash-filter">
              {f.icon}
              {f.label}
              {!!counts[f.id] && <span className="tabular text-[10px] text-ink-3">{counts[f.id]}</span>}
            </Chip>
          ))}
        </HScroll>
        {ws !== ALL && <CollectionPicker />}
      </div>

      <Composer searchRef={searchRef} query={query} setQuery={setQuery} onNewDoc={newDoc} />

      <div className="scroll fade-y -mx-1 min-h-0 flex-1 px-1 py-1">
        {ws === ALL && !query && filter === "all" && <FolderGrid />}
        {shown.length === 0 ? (
          query ? (
            <Empty icon={<Search size={20} />} title="No matches" hint={`Nothing saved matches “${query}”.`} />
          ) : filter === "clip" ? (
            <Empty icon={<ClipboardList size={20} />} title="Clipboard history is empty" hint="Copy anything — it shows up here. Press Ctrl+Alt+V to jump here anytime." />
          ) : filter === "file" ? (
            <Empty icon={<FolderOpen size={20} />} title="Drop files here" hint="Drag files onto the island to keep them handy. Only the location is stored — never a copy." />
          ) : filter === "note" ? (
            <Empty icon={<DocIcon size={20} />} title={curWs ? `No docs in ${curWs.name} yet` : "No docs yet"} hint="Write project docs, meeting notes, READMEs — with checklists and formatting. Press Ctrl+N.">
              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                {DOC_TEMPLATES.slice(1, 4).map((t) => (
                  <motion.button key={t.id} whileHover={{ y: -2 }} whileTap={{ scale: 0.94 }} onClick={() => newDoc(t.id)} className="rounded-full bg-white/7 px-2.5 py-1 text-[11.5px] text-ink-2 hover:bg-white/12">
                    <span className="flex items-center gap-1.5">
                      <InlineIcon name={t.icon} size={12} />
                      {t.label}
                    </span>
                  </motion.button>
                ))}
              </div>
            </Empty>
          ) : (
            <Empty
              icon={curWs ? <InlineIcon name={curWs.icon} color={curWs.color} size={20} /> : <Archive size={20} />}
              title={curWs ? `${curWs.name} is empty` : "Your stash is empty"}
              hint="Drop files, paste links, write docs. Clipboard history is captured automatically."
            />
          )
        ) : (
          <div className="space-y-0.5">
            {filter === "all" && !query ? (
              <GroupedList items={visible} onOpenDoc={setEditing} onSeeAll={setFilter} />
            ) : (
              <AnimatePresence initial={false} mode="popLayout">
                {shown.map((i) => (
                  <StashItemView key={i.id} item={i} onOpenDoc={setEditing} />
                ))}
              </AnimatePresence>
            )}
            {(filter !== "all" || query) && visible.length > limit && (
              <button onClick={() => setLimit(limit + 60)} className="mx-auto mt-1 block rounded-full px-3 py-1 text-[11.5px] text-ink-3 hover:bg-white/6 hover:text-ink-2">
                Show {Math.min(60, visible.length - limit)} more
              </button>
            )}
            {filter === "clip" && counts.clip > 0 && (
              <button
                onClick={() => {
                  const before = useStash.getState().items;
                  clearClips(true);
                  toast("Cleared clipboard history (kept pinned & sorted)", { label: "Undo", run: () => useStash.setState({ items: before }) });
                }}
                className="mx-auto mt-1 block rounded-full px-3 py-1 text-[11px] text-ink-4 hover:bg-bad/10 hover:text-bad"
              >
                Clear history
              </button>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={spring}
            className="absolute inset-0 z-20 grid place-items-center rounded-3xl border-2 border-dashed border-[var(--accent)]/70 bg-island/92 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-2 text-center">
              <motion.div
                key={dragKind}
                initial={{ scale: 0.4, rotate: -20 }}
                animate={{ scale: 1, rotate: 0, y: [0, -8, 0] }}
                transition={{ scale: { type: "spring", stiffness: 500, damping: 14 }, y: { duration: 1, repeat: Infinity, ease: "easeInOut" } }}
                className="text-[34px]"
              >
                {dragKind === "files" ? <FileDown size={34} strokeWidth={1.6} /> : dragKind === "link" ? <Link2 size={34} strokeWidth={1.6} /> : <DocIcon size={34} strokeWidth={1.6} />}
              </motion.div>
              <div className="text-[14px] font-semibold">
                {dragKind === "files" ? `Drop ${dragCount > 1 ? `${dragCount} files` : "file"} to stash` : dragKind === "link" ? "Drop to save link" : "Drop text to save as a doc"}
              </div>
              <div className="text-[11.5px] text-ink-3">
                {curWs ? `Into ${curWs.name}` : "Into Personal"}
                {collection ? " · this subfolder" : ""}
                {dragKind === "files" ? " · files stay where they are" : ""}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export const stashModule: IslandModule = {
  id: "stash",
  title: "Stash",
  icon: Archive,
  size: { w: 660, h: 440 },
  View: StashView,
  description: "Files, links, docs and clipboard history — organised into folders and subfolders.",
};

export { copy as copyToClipboard };
