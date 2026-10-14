/**
 * Natural-language todo parser.
 *   "Pay rent tomorrow 9am !high #bills" -> title, due, priority, tags
 * Supports: today, tonight, tomorrow, weekday names, "next week", "in N days/hours",
 * dates (10/24, 24 Oct, Oct 24), times (9am, 18:30), !low/!med/!high/!!!, #tag, @list
 */
export interface ParsedTodo {
  title: string;
  due?: number;
  hasTime?: boolean;
  priority?: 0 | 1 | 2 | 3;
  tags: string[];
  list?: string;
}

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export function parseQuickAdd(input: string, now = new Date()): ParsedTodo {
  let text = ` ${input} `;
  const out: ParsedTodo = { title: "", tags: [] };
  let day: Date | undefined;
  let time: { h: number; m: number } | undefined;

  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = text.match(re);
    if (m) {
      fn(m);
      text = text.replace(m[0], " ");
    }
  };

  take(/\s(!!!|!high|!h|!urgent)(?=\s)/i, () => (out.priority = 3));
  take(/\s(!!|!med|!medium|!m)(?=\s)/i, () => (out.priority = 2));
  take(/\s(!|!low|!l)(?=\s)/i, () => (out.priority = 1));

  let m: RegExpMatchArray | null;
  while ((m = text.match(/\s#([\p{L}\p{N}_-]+)/u))) {
    out.tags.push(m[1].toLowerCase());
    text = text.replace(m[0], " ");
  }
  take(/\s@([\p{L}\p{N}_-]+)/u, (mm) => (out.list = mm[1]));

  take(/\s(?:at\s)?(\d{1,2})(?::(\d{2}))?\s?(am|pm)(?=\s)/i, (mm) => {
    let h = +mm[1] % 12;
    if (mm[3].toLowerCase() === "pm") h += 12;
    time = { h, m: mm[2] ? +mm[2] : 0 };
  });
  if (!time)
    take(/\s(?:at\s)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/, (mm) => (time = { h: +mm[1], m: +mm[2] }));

  const today = startOfDay(now);
  const addDays = (n: number) => new Date(today.getTime() + n * 86400000);

  take(/\sin\s(\d+)\s?(minutes?|mins?|m|hours?|hrs?|h)(?=\s)/i, (mm) => {
    const n = +mm[1];
    const ms = /^h/i.test(mm[2]) ? n * 3600000 : n * 60000;
    const d = new Date(now.getTime() + ms);
    day = startOfDay(d);
    time = { h: d.getHours(), m: d.getMinutes() };
  });
  take(/\sin\s(\d+)\s?(days?|d|weeks?|w)(?=\s)/i, (mm) => (day = addDays(+mm[1] * (/^w/i.test(mm[2]) ? 7 : 1))));
  take(/\s(today|tod)(?=\s)/i, () => (day = today));
  take(/\s(tonight)(?=\s)/i, () => {
    day = today;
    time ??= { h: 20, m: 0 };
  });
  take(/\s(tomorrow|tmr|tmrw)(?=\s)/i, () => (day = addDays(1)));
  take(/\s(next week)(?=\s)/i, () => (day = addDays((8 - today.getDay()) % 7 || 7)));
  take(/\s(?:on\s|next\s)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|sday|urday)?(?=\s)/i, (mm) => {
    const idx = DAYS.findIndex((d) => d.startsWith(mm[1].toLowerCase().slice(0, 3)));
    let diff = (idx - today.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    day = addDays(diff);
  });
  take(/\s(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?=\s)/, (mm) => {
    const y = mm[3] ? (+mm[3] < 100 ? 2000 + +mm[3] : +mm[3]) : today.getFullYear();
    const d = new Date(y, +mm[1] - 1, +mm[2]);
    if (!mm[3] && d < today) d.setFullYear(y + 1);
    day = d;
  });
  const monthAlt = MONTHS.join("|");
  take(new RegExp(`\\s(\\d{1,2})\\s(${monthAlt})[a-z]*(?=\\s)`, "i"), (mm) => {
    day = new Date(today.getFullYear(), MONTHS.indexOf(mm[2].toLowerCase().slice(0, 3)), +mm[1]);
    if (day < today) day.setFullYear(day.getFullYear() + 1);
  });
  take(new RegExp(`\\s(${monthAlt})[a-z]*\\s(\\d{1,2})(?=\\s)`, "i"), (mm) => {
    day = new Date(today.getFullYear(), MONTHS.indexOf(mm[1].toLowerCase().slice(0, 3)), +mm[2]);
    if (day < today) day.setFullYear(day.getFullYear() + 1);
  });

  if (time && !day) {
    day = today;
    if (time.h * 60 + time.m <= now.getHours() * 60 + now.getMinutes()) day = addDays(1);
  }
  if (day) {
    const d = new Date(day);
    if (time) d.setHours(time.h, time.m, 0, 0);
    out.due = d.getTime();
    out.hasTime = !!time;
  }
  out.title = text.replace(/\s+/g, " ").trim();
  return out;
}

export function describeDue(due: number, hasTime?: boolean, now = new Date()) {
  const d = new Date(due);
  const dayDiff = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86400000);
  let label =
    dayDiff === 0 ? "Today" :
    dayDiff === 1 ? "Tomorrow" :
    dayDiff === -1 ? "Yesterday" :
    dayDiff > 1 && dayDiff < 7 ? d.toLocaleDateString(undefined, { weekday: "short" }) :
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (hasTime) label += ` ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  const overdue = hasTime ? due < now.getTime() : dayDiff < 0;
  return { label, overdue, dayDiff };
}
