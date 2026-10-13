import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "live";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "border-transparent bg-indigo-500/10 text-indigo-400 border border-indigo-500/30",
    secondary: "border-transparent bg-slate-800 text-slate-300",
    destructive: "border-transparent bg-rose-500/10 text-rose-400 border border-rose-500/30",
    outline: "text-slate-300 border border-slate-700",
    success: "border-transparent bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
    live: "border-transparent bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
