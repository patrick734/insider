import type { Metadata } from "next";
import { sql } from "@insider/core";
import { SITE } from "@/lib/config";
import { ShareRedirect } from "@/components/share-redirect";

export const dynamic = "force-dynamic";

/**
 * Share links (insider.family/s/CODE). Crawlers (X, Telegram) read this page's preview card; people are sent on to
 * the waitlist with the code remembered, so the invite is credited when they verify.
 */
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const [u] = /^[a-z0-9]{6,12}$/i.test(code)
    ? await sql()`select coalesce(u.x_handle, u.handle) as who from referral_codes c join users u on u.id = c.user_id where c.code = ${code.toLowerCase()}`
    : [];
  const title = u?.who ? `@${u.who} invited you to ${SITE.name}` : `Join the ${SITE.name} founder waitlist`;
  const image = `${SITE.url}/api/og/${encodeURIComponent(code.toLowerCase())}`;
  return {
    title,
    description: SITE.tagline,
    openGraph: { title, description: SITE.tagline, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description: SITE.tagline, images: [image] },
  };
}

export default async function Share({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <ShareRedirect code={code.toLowerCase()} />;
}
