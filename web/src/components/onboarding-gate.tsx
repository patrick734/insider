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
    // The waitlist works without a handle (X is the identity there).
    const exempt = ["/welcome", "/waitlist", "/s/", "/api"].some((p) => path.startsWith(p));
    if (me && !me.handle && !exempt) router.replace("/welcome");
  }, [me, path, router]);
  return null;
}
