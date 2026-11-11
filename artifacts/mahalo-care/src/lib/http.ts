/** Small JSON fetch for endpoints not yet in the generated client. Same-origin cookies, readable errors. */
export const apiUrl = (p: string) => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api${p}`;
/** Match the generated client's double-submit proof for browser mutations. Never weaken server CSRF checks. */
export function sessionMutationHeaders(initial?:HeadersInit):Headers{
  const headers=new Headers(initial);
  if(!headers.has("Content-Type"))headers.set("Content-Type","application/json");
  const csrf=typeof document!=="undefined"?document.cookie.split("; ").find(c=>c.startsWith("mahalo_csrf="))?.slice("mahalo_csrf=".length):undefined;
  if(csrf)headers.set("x-csrf-token",decodeURIComponent(csrf));
  return headers;
}
export async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const mutation=!["GET","HEAD","OPTIONS"].includes((init?.method??"GET").toUpperCase());
  const headers=mutation?sessionMutationHeaders(init?.headers):new Headers(init?.headers);
  if(!headers.has("Content-Type"))headers.set("Content-Type","application/json");
  const r = await fetch(apiUrl(path), { credentials: "include", ...init, headers });
  let body: unknown = null;
  try { body = await r.json(); } catch { /* empty */ }
  if (!r.ok) {
    const b = body as { error?: unknown; message?: unknown } | null;
    const msg = typeof b?.error === "string" ? b.error : typeof b?.message === "string" ? b.message : `Request failed (${r.status})`;
    throw Object.assign(new Error(msg), { status: r.status, data: body });
  }
  return body as T;
}

/** Authenticated file download (same-origin cookies, base path aware, readable errors). Accepts "/api/..." or relative API paths. */
export async function downloadFile(path: string, fallbackName: string): Promise<string> {
  const p = path.startsWith("/api/") ? path.slice(4) : path;
  const r = await fetch(apiUrl(p), { credentials: "include" });
  if (!r.ok) {
    let msg = `Download failed (${r.status})`;
    try { const j = await r.json(); if (typeof j?.error === "string") msg = j.error; else if (typeof j?.message === "string") msg = j.message; } catch { /* non-JSON */ }
    throw Object.assign(new Error(msg), { status: r.status });
  }
  const blob = await r.blob();
  const cd = r.headers.get("content-disposition") ?? "";
  const name = /filename="?([^";]+)"?/.exec(cd)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return name;
}
