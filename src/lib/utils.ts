import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const DEBUG =
  typeof window !== "undefined" &&
  (window as any).__CBM_DEBUG__ === true &&
  process.env.NODE_ENV !== "production";

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
