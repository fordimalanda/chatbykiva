"use client";

import { useSocket } from "@/context/SocketContext";
import { Database, Activity, Sparkles } from "lucide-react";

export function KivaEventTicker() {
  const { recentEvents, connected } = useSocket();

  if (recentEvents.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3.5 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-400 animate-pulse" />
          <span>KivaDB Real-Time Stream : en attente d&apos;opérations...</span>
        </div>
        <span className="text-[11px] font-mono text-indigo-400">workspace: social_app</span>
      </div>
    );
  }

  const latest = recentEvents[0];

  return (
    <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-3.5 backdrop-blur-sm shadow-inner transition-all">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="h-6 w-6 rounded-md bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
            <Activity className="h-3.5 w-3.5 text-indigo-300 animate-spin" />
          </div>
          <div className="truncate text-xs">
            <span className="font-semibold text-indigo-200 uppercase tracking-wider text-[10px] mr-2 px-1.5 py-0.5 rounded bg-indigo-500/30">
              KIVADB {latest.event}
            </span>
            <span className="font-mono text-slate-300">{latest.key || "table"}</span>
            {latest.type && (
              <span className="text-slate-400 text-[11px] ml-1.5 font-normal">
                ({latest.type})
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2 text-[11px] text-indigo-300 font-mono">
          <Database className="h-3.5 w-3.5 text-indigo-400" />
          <span>social_app</span>
        </div>
      </div>
    </div>
  );
}
