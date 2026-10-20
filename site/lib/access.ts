import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const ACCESS_COOKIE = "wellness_access";
export const ACCESS_SECONDS = 60 * 60 * 24;

export function issueAccess(secret: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ id: randomUUID(), exp: now + ACCESS_SECONDS * 1000 })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function verifyAccess(token: string | undefined, secret: string, now = Date.now()) {
  if (!token || !secret || token.length > 1024) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof decoded.id === "string" && typeof decoded.exp === "number" && decoded.exp > now && decoded.exp <= now + ACCESS_SECONDS * 1000;
  } catch { return false; }
}
