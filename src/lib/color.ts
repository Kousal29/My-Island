/** Extract a vivid accent color from album art for glows and progress bars. */
const cache = new Map<string, string>();

export function extractAccent(src: string): Promise<string | null> {
  const hit = cache.get(src);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const size = 24;
        const c = document.createElement("canvas");
        c.width = c.height = size;
        const g = c.getContext("2d", { willReadFrequently: true })!;
        g.drawImage(img, 0, 0, size, size);
        const { data } = g.getImageData(0, 0, size, size);
        const buckets = new Map<string, { r: number; g: number; b: number; n: number; score: number }>();
        for (let i = 0; i < data.length; i += 4) {
          const [r, gg, b] = [data[i], data[i + 1], data[i + 2]];
          const max = Math.max(r, gg, b);
          const min = Math.min(r, gg, b);
          const sat = max ? (max - min) / max : 0;
          const lum = (max + min) / 510;
          if (lum < 0.12 || lum > 0.92) continue;
          const key = `${r >> 5},${gg >> 5},${b >> 5}`;
          const e = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0, score: 0 };
          e.r += r; e.g += gg; e.b += b; e.n++;
          e.score += 0.4 + sat * 1.6;
          buckets.set(key, e);
        }
        let best: { r: number; g: number; b: number; n: number; score: number } | undefined;
        buckets.forEach((e) => (!best || e.score > best.score) && (best = e));
        if (!best) return resolve(null);
        let [r, gg, b] = [best.r / best.n, best.g / best.n, best.b / best.n];
        // Lift dark accents so they glow on the black island.
        const lum = (Math.max(r, gg, b) + Math.min(r, gg, b)) / 510;
        if (lum < 0.5) {
          const k = 0.5 / Math.max(lum, 0.15);
          [r, gg, b] = [r, gg, b].map((v) => Math.min(255, v * Math.min(k, 2.2)));
        }
        const out = `rgb(${r | 0}, ${gg | 0}, ${b | 0})`;
        cache.set(src, out);
        resolve(out);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
