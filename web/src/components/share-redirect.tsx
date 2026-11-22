"use client";

import { useEffect } from "react";

/** Remember the invite code for 30 days, then open the waitlist. */
export function ShareRedirect({ code }: { code: string }) {
  useEffect(() => {
    if (/^[a-z0-9]{6,12}$/.test(code)) document.cookie = `insider_ref=${code}; path=/; max-age=${30 * 86400}; samesite=lax`;
    window.location.replace(`/waitlist?ref=${encodeURIComponent(code)}`);
  }, [code]);
  return <p className="mono px-6 py-16 text-center text-sm text-muted">Opening the waitlist…</p>;
}
