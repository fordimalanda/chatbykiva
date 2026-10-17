import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(timestamp: number): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(timestamp: number): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

/** "à l'instant", "il y a 5 min", "il y a 3 h", "hier", puis la date */
export function timeAgo(timestamp: number): string {
  if (!timestamp) return "";
  const diff = Math.max(0, Date.now() - timestamp);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "hier";
  if (d < 7) return `il y a ${d} j`;
  return formatDate(timestamp);
}

/** Libellé de séparateur de jour dans une conversation */
export function dayLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (date.toDateString() === yesterday.toDateString()) return "Hier";
  return date.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
}

export function lastSeenLabel(online: boolean, lastSeen?: number): string {
  if (online) return "En ligne";
  if (!lastSeen) return "Hors ligne";
  return `Vu ${timeAgo(lastSeen)}`;
}
