// src/lib/export.ts

/**
 * Convert an array of objects to CSV format
 */
export function toCSV(rows: Array<Record<string, any>>) {
  if (rows.length === 0) return "";
  
  const keys = Object.keys(rows[0] || {});
  const head = keys.join(",");
  const body = rows.map(r => keys.map(k => JSON.stringify(r[k] ?? "")).join(",")).join("\n");
  return head + "\n" + body;
}

/**
 * Download data as a file
 */
export function download(filename: string, data: string, mime = "text/csv") {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
