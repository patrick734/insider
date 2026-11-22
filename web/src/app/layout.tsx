import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { RefCapture } from "@/components/ref-capture";
import { OnboardingGate } from "@/components/onboarding-gate";
import { MobileChrome, SideNav } from "@/components/nav";
import { getMe } from "@/server/auth";
import { unreadCounts } from "@/server/queries";
import { SITE } from "@/lib/config";
import { demoLoginEnabled } from "@/server/demo";

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
  return (
    <html lang="en" className={`${grotesk.variable} ${jetbrains.variable}`}>
      <body>
        <Providers me={me}>
          {demoLoginEnabled() && (
            <div className="mono bg-accent px-4 py-1 text-center text-[10.5px] font-bold tracking-[0.14em] text-on-accent">DEMO · SAMPLE DATA<span className="hidden sm:inline"> · SIGN IN AS ANY SAMPLE ACCOUNT</span></div>
          )}
          <RefCapture />
          <OnboardingGate />
          <MobileChrome counts={counts} />
          <div className="mx-auto flex w-full max-w-[1320px] items-start">
            <div className="hidden flex-none border-r border-accent/18 bg-black/55 lg:block">
              <SideNav counts={counts} />
            </div>
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
