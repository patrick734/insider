import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

export const SESSION_COOKIE = "insider_session";
export const SESSION_DAYS = 30;

export type SessionClaims = { uid: string; addr: string };

const key = () => new TextEncoder().encode(env("SESSION_SECRET"));

/** A signed session token (HS256). The web app sets it as an httpOnly cookie; the realtime service reads it too. */
export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .setIssuer("insider")
    .sign(key());
}

export async function verifySession(token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: "insider", algorithms: ["HS256"] });
    if (typeof payload.uid !== "string" || typeof payload.addr !== "string") return null;
    return { uid: payload.uid, addr: payload.addr };
  } catch {
    return null;
  }
}

/** Read one cookie from a Cookie header. */
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}
