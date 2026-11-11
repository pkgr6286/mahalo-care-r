/**
 * Cross-tab "access context changed" signal. Carries only the user id and a nonce — no PHI.
 * Receivers clear caches and refetch /me; they never rebroadcast.
 */
type Msg = { type: "context-changed"; userId: string; nonce: string };
const CH = "mahalo-access-context";
const LS = "mahalo-access-context";

let channel: BroadcastChannel | null = null;
try { channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CH) : null; } catch { channel = null; }

export function announceContextChange(userId: string) {
  const msg: Msg = { type: "context-changed", userId, nonce: Math.random().toString(36).slice(2) };
  if (channel) { channel.postMessage(msg); return; }
  try { localStorage.setItem(LS, JSON.stringify(msg)); localStorage.removeItem(LS); } catch { /* storage unavailable */ }
}

export function onContextChange(userId: string, handler: () => void) {
  const ok = (m: unknown) => !!m && (m as Msg).type === "context-changed" && (m as Msg).userId === userId;
  const onMsg = (e: MessageEvent) => { if (ok(e.data)) handler(); };
  const onStorage = (e: StorageEvent) => { if (e.key !== LS || !e.newValue) return; try { if (ok(JSON.parse(e.newValue))) handler(); } catch { /* ignore */ } };
  channel?.addEventListener("message", onMsg);
  window.addEventListener("storage", onStorage);
  return () => { channel?.removeEventListener("message", onMsg); window.removeEventListener("storage", onStorage); };
}
