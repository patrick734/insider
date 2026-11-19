"use client";

import { useEffect } from "react";

/** Remember an invite code from ?ref=CODE for 30 days, so it counts when the person signs up. */
export function RefCapture() {
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("ref");
    if (code && /^[a-z0-9]{6,12}$/i.test(code) && !document.cookie.includes("insider_ref=")) {
      document.cookie = `insider_ref=${code.toLowerCase()}; path=/; max-age=${30 * 86400}; samesite=lax`;
    }
  }, []);
  return null;
}
