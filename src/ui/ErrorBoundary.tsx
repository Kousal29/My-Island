import { Component, type ReactNode } from "react";

/** Keeps a rendering bug from blanking the whole island; shows what failed and a reload. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("island crashed", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-full w-full justify-center">
        <div className="pointer-events-auto mt-1 max-w-[560px] rounded-2xl bg-island px-4 py-3 text-[11.5px] text-ink-2 shadow-xl ring-1 ring-white/10">
          <div className="mb-1 font-semibold text-bad">Something went wrong</div>
          <div className="font-mono text-[10.5px] break-words text-ink-3">{String(error.message || error)}</div>
          <div className="mt-1 max-h-24 overflow-hidden font-mono text-[9.5px] whitespace-pre-wrap text-ink-4">{(error.stack ?? "").split("\n").slice(1, 6).join("\n")}</div>
          <button onClick={() => location.reload()} className="mt-2 rounded-full bg-white/10 px-3 py-1 text-[11.5px] text-ink hover:bg-white/16">
            Reload
          </button>
        </div>
      </div>
    );
  }
}
