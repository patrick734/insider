import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

/**
 * A short-lived ticket for opening a room socket. The web app issues it to a signed-in user; the realtime service
 * checks it. Works even when the socket lives on another domain than the session cookie.
 */
export type Ticket = { uid: string; room: string };

const key = () => new TextEncoder().encode(`ws:${env("SESSION_SECRET")}`);

export async function signTicket(t: Ticket): Promise<string> {
  return new SignJWT(t).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2m").setIssuer("insider-ws").sign(key());
}

export async function verifyTicket(token: string | null): Promise<Ticket | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: "insider-ws", algorithms: ["HS256"] });
    if (typeof payload.uid !== "string" || typeof payload.room !== "string") return null;
    return { uid: payload.uid, room: payload.room };
  } catch {
    return null;
  }
}
