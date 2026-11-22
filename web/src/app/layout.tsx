import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { RefCapture } from "@/components/ref-capture";
import { OnboardingGate } from "@/components/onboarding-gate";
import { MobileChrome, SideNav } from "@/components/nav";
import { LogoMark, Wordmark } from "@/components/icons";
import { getMe } from "@/server/auth";
import { unreadCounts } from "@/server/queries";
import { SITE } from "@/lib/config";
import { demoLoginEnabled } from "@/server/demo";
import { foundersLeft } from "@/server/waitlist";
import { hasAppAccess, isPublicPath, waitlistMode } from "@/server/access";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-grotesk" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: SITE.name, template: `%s · ${SITE.name}` },
  description: SITE.tagline,
  openGraph: { title: SITE.name, description: SITE.tagline, siteName: SITE.domain },
};

export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe().catch(() => null);
  const counts = me ? await unreadCounts(me.id).catch(() => ({ notifications: 0, messages: 0 })) : { notifications: 0, messages: 0 };
  const left = await foundersLeft().catch(() => 200);
  // Waitlist-first launch: everything but the waitlist (and terms/privacy) needs access.
  const path = (await headers()).get("x-pathname") ?? "/";
  const gated = waitlistMode() && !isPublicPath(path) && !(await hasAppAccess(me));
  if (gated) redirect("/waitlist");
  const appOpen = !waitlistMode() || (await hasAppAccess(me));
  return (
    <html lang="en" className={`${grotesk.variable} ${jetbrains.variable}`}>
      <body>
        <Providers me={me}>
          {demoLoginEnabled() && (
            <div className="mono bg-accent px-4 py-1 text-center text-[10.5px] font-bold tracking-[0.14em] text-on-accent">DEMO · SAMPLE DATA<span className="hidden sm:inline"> · SIGN IN AS ANY SAMPLE ACCOUNT</span></div>
          )}
          <RefCapture />
          {appOpen ? (
            <>
              <OnboardingGate />
              <MobileChrome counts={counts} foundersLeft={left} />
              <div className="mx-auto flex w-full max-w-[1320px] items-start">
                <div className="hidden flex-none border-r border-accent/18 bg-black/55 lg:block">
                  <SideNav counts={counts} foundersLeft={left} />
                </div>
                {children}
              </div>
            </>
          ) : (
            // Waitlist-first: just the logo bar and the page (waitlist, terms, privacy).
            <>
              <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-accent/22 bg-black/90 px-4 backdrop-blur sm:px-6">
                <a href="/waitlist" className="flex items-center gap-2.5 text-text hover:text-text">
                  <LogoMark size={26} />
                  <Wordmark size={13} />
                </a>
                <span className="mono text-[10.5px] tracking-[0.12em] text-muted">{left} FOUNDER SPOTS LEFT</span>
              </header>
              <div className="mx-auto flex w-full max-w-[1100px] items-start">{children}</div>
            </>
          )}
        </Providers>
      </body>
    </html>
  );
}
