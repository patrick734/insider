"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/session";

/** Signed in without a handle yet: send them to the welcome screen first. */
export function OnboardingGate() {
  const { me } = useSession();
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (me && !me.handle && !path.startsWith("/welcome") && !path.startsWith("/api")) router.replace("/welcome");
  }, [me, path, router]);
  return null;
}
