import { create } from "zustand";

export interface Toast { id: number; text: string; action?: { label: string; run: () => void }; tone?: "default" | "good" | "bad" }

interface ToastState { toasts: Toast[]; push: (t: Omit<Toast, "id">, ms?: number) => void; dismiss: (id: number) => void }

let n = 0;
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t, ms = 3800) => {
    const id = ++n;
    set({ toasts: [...get().toasts.slice(-2), { ...t, id }] });
    setTimeout(() => get().dismiss(id), ms);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (text: string, action?: Toast["action"], tone?: Toast["tone"]) => useToasts.getState().push({ text, action, tone });
