'use client';
import { create } from 'zustand';

interface Toast {
  id: number;
  text: string;
}

export const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));

let next = 1;
/** Shows a short message at the bottom of the screen. */
export function toast(text: string, ms = 3500) {
  const id = next++;
  useToasts.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, text }] }));
  setTimeout(() => useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}
