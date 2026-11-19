import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { sql } from "@insider/core";
import { Avatar } from "@/components/avatar";
import { Corners, Main, PageHeader, Section } from "@/components/page";
import { Rail } from "@/components/rail";
import { CopyButton } from "@/components/copy-button";
import { getMe } from "@/server/auth";
import { SITE } from "@/lib/config";
import { ago, displayName } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invite & earn" };

export default async function Invite() {
  const me = await getMe();
  if (!me) redirect("/");
  // One code per person, made the first time they open this page.
  await sql()`insert into invites (code, inviter_id) values (${randomBytes(5).toString("hex").slice(0, 8)}, ${me.id}) on conflict (inviter_id) do nothing`;
  const [inv] = await sql()`select code from invites where inviter_id = ${me.id}`;
  const joined = await sql()`select id, address, handle, name, avatar_url, created_at from users where invited_by = ${me.id} order by id desc limit 100`;
  const link = `${SITE.url}/?ref=${inv.code}`;
  return (
    <>
      <Main>
        <PageHeader title="Invite & earn" sub="FEE SHARE, NOT POINTS" />
        <section className="panel mx-4 mt-4 p-5 sm:mx-5">
          <Corners />
          <span className="label">// YOUR LINK</span>
          <div className="mt-3 flex gap-2">
            <input readOnly value={link} className="input mono min-w-0 flex-1 text-xs" />
            <CopyButton text={link} />
          </div>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-body">
            <li className="flex gap-2.5">
              <span className="dot mt-1.5 flex-none" />
              Anyone who signs up through your link is counted as your invite.
            </li>
            <li className="flex gap-2.5">
              <span className="dot mt-1.5 flex-none" />
              Once they stay and trade, you earn a share of the swap fees they pay. Paid in ETH, never in points.
            </li>
          </ul>
        </section>
        <Section label={`// JOINED THROUGH YOU · ${joined.length}`}>
          {joined.length === 0 ? (
            <p className="px-5 pb-6 text-sm text-muted">No one yet. Send your link to the people in your coin&apos;s chat.</p>
          ) : (
            <div className="divide-line">
              {joined.map((u) => {
                const user = { address: u.address as string, handle: (u.handle as string) ?? null, name: (u.name as string) ?? null, avatarUrl: (u.avatar_url as string) ?? null };
                return (
                  <div key={String(u.id)} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <Avatar user={user} size={36} />
                    <b className="flex-1 truncate">{displayName(user)}</b>
                    <span className="mono text-[11px] text-dim">{ago(u.created_at as Date)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </Main>
      <Rail />
    </>
  );
}
