"use client";

import { useEffect } from "react";

/** Marks notifications read a moment after the page is seen, so unread rows still show highlighted on this visit. */
export function MarkRead() {
  useEffect(() => {
    const t = setTimeout(() => void fetch("/api/notifications/read", { method: "POST" }), 2500);
    return () => clearTimeout(t);
  }, []);
  return null;
}
