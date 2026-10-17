/**
 * Mini-système de notifications à l'écran (remplace les alert() bloquants).
 * Utilisable partout, même hors composants React : toast("Message"), toast.success(...), toast.error(...)
 */
export type ToastKind = "info" | "success" | "error";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(toasts);
}

function push(message: string, kind: ToastKind = "info", durationMs = 3800) {
  const id = nextId++;
  toasts = [...toasts.slice(-3), { id, kind, message }];
  emit();
  setTimeout(() => dismissToast(id), durationMs);
  return id;
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => listeners.delete(listener);
}

export const toast = Object.assign((message: string) => push(message, "info"), {
  success: (message: string) => push(message, "success"),
  error: (message: string) => push(message, "error", 5000),
});
