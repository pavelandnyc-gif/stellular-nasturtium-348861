// Sesión firmada para el "modo local" (vista previa sin Supabase).
// Usa Web Crypto para funcionar igual en el proxy y en el servidor.

export const LOCAL_COOKIE = "jarvis_local_session";
export const LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";
const MAX_AGE_S = 60 * 60 * 24 * 60; // 60 días

function b64url(bytes: Uint8Array) {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64url(new Uint8Array(sig));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function signLocalSession(secret: string, now = Date.now()) {
  const exp = Math.floor(now / 1000) + MAX_AGE_S;
  const payload = `${LOCAL_USER_ID}.${exp}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function verifyLocalSession(secret: string, token: string | undefined, now = Date.now()) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [uid, exp, sig] = parts;
  if (!safeEqual(sig, await hmac(secret, `${uid}.${exp}`))) return null;
  if (Number(exp) * 1000 < now) return null;
  return uid;
}

export const LOCAL_MAX_AGE_S = MAX_AGE_S;

export { safeEqual };
