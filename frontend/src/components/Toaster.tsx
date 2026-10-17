"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { subscribeToasts, dismissToast, ToastItem } from "@/lib/toast";
import { cn } from "@/lib/utils";

const styles = {
  success: { icon: CheckCircle2, cls: "border-emerald-500/40 text-emerald-300" },
  error: { icon: AlertCircle, cls: "border-rose-500/40 text-rose-300" },
  info: { icon: Info, cls: "border-indigo-500/40 text-indigo-300" },
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => subscribeToasts(setItems), []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4.25rem)] z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6"
    >
      {items.map((t) => {
        const { icon: Icon, cls } = styles[t.kind];
        return (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-slate-900/95 px-4 py-3 text-sm text-slate-100 shadow-2xl shadow-black/40 backdrop-blur-xl animate-toast-in",
              cls
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="flex-1 leading-snug text-slate-100">{t.message}</p>
            <button
              onClick={() => dismissToast(t.id)}
              className="-mr-1 rounded-md p-0.5 text-slate-400 hover:text-white"
              aria-label="Fermer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
