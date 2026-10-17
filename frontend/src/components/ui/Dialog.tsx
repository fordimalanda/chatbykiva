"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  size?: "md" | "lg";
}

/**
 * Modale responsive : feuille ancrée en bas sur mobile (pouce-friendly),
 * boîte centrée à partir de sm.
 */
export function Dialog({ open, onOpenChange, title, description, children, size = "md" }: DialogProps) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    };
    if (open) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md animate-fade-up"
        onClick={() => onOpenChange(false)}
      />

      {/* Modal Dialog Box */}
      <div
        className={cn(
          "relative flex w-full max-h-[92dvh] flex-col rounded-t-3xl border border-slate-800 bg-slate-900/95 shadow-2xl shadow-indigo-500/10 backdrop-blur-xl animate-fade-up sm:rounded-2xl",
          size === "lg" ? "sm:max-w-2xl" : "sm:max-w-md"
        )}
      >
        {/* Poignée mobile */}
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-slate-700 sm:hidden" />

        <div className="flex items-start justify-between gap-3 px-5 pt-4 sm:px-6 sm:pt-6">
          <div className="min-w-0">
            {title && <h2 className="text-lg font-bold tracking-tight text-white">{title}</h2>}
            {description && <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{description}</p>}
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="-mr-1 shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 overflow-y-auto px-5 pb-[calc(1.25rem+var(--safe-bottom))] sm:px-6 sm:pb-6">{children}</div>
      </div>
    </div>
  );
}
