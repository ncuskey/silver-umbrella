import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const DEBUG =
  // runtime flag (DevTools or early boot script)
  (typeof window !== "undefined" && (window as any).__CBM_DEBUG__ === true)
  // URL switch ?debug=1 (boot script below writes this)
  || (typeof window !== "undefined" && localStorage.getItem("cbm_debug") === "1")
  // env switch for Netlify previews, etc.
  || process.env.NEXT_PUBLIC_CBM_DEBUG === "1";

export function dlog(...args: any[]) {
  if (DEBUG) console.log(...args);
}
export function dgroup(label: string, fn: () => void) {
  if (!DEBUG) return;
  console.groupCollapsed(label);
  try { fn(); } finally { console.groupEnd(); }
}
export function dtable(label: string, rows: any[]) {
  if (DEBUG && (console as any).table) {
    console.log(label);
    (console as any).table(rows);
  }
}
