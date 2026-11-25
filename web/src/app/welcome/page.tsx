import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sql } from "@insider/core";
import { LogoMark } from "@/components/icons";
import { Main } from "@/components/page";
import { WelcomeForm } from "@/components/welcome-form";
import { getMe } from "@/server/auth";
import { SITE } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Welcome" };

export default async function Welcome() {
  const me = await getMe();
  if (!me) redirect("/");
  // Hosts worth following first: people running rooms, busiest first.
  const hosts = await sql()`
    select u.id, u.address, u.handle, u.name, u.avatar_url, u.bio, count(m.*)::int as members
    from rooms r join users u on u.id = r.host_id left join room_members m on m.room_id = r.id
    where u.id <> ${me.id} and u.handle is not null
    group by u.id order by members desc limit 6`;
  const [{ rooms, people }] = await sql()`select (select count(*) from rooms)::int as rooms, (select count(*) from users where handle is not null)::int as people`;
  return (
    <Main>
      <div className="relative overflow-hidden border-b border-accent/20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(46,168,255,0.22),transparent_65%)]" />
        <div className="relative mx-auto max-w-xl px-4 pb-8 pt-10 sm:px-6 sm:pt-14">
          <LogoMark size={52} />
          <span className="label mt-6 block">// WELCOME IN</span>
          <h1 className="mt-2 text-[30px] font-bold leading-[1.08] sm:text-[38px]">
            Welcome to {SITE.name}
            {me.xHandle ? <span className="text-accent">, @{me.xHandle}</span> : null}.
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-soft">{SITE.tagline} Three quick steps and you&apos;re in a room.</p>
          <div className="mono mt-5 flex gap-5 text-[11px] tracking-[0.1em] text-muted">
            <span>
              <b className="text-text">{Number(people)}</b> MEMBERS
            </span>
            <span>
              <b className="text-text">{Number(rooms)}</b> ROOMS
            </span>
            <span className="flex items-center gap-1.5">
              <span className="dot !h-1.5 !w-1.5" /> BASE
            </span>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-xl px-4 pb-16 sm:px-6">
        <WelcomeForm
          me={{ handle: me.handle ?? "", name: me.name ?? "", address: me.address, xHandle: me.xHandle ?? null }}
          hosts={hosts.map((h) => ({
            id: String(h.id),
            address: h.address as string,
            handle: (h.handle as string) ?? null,
            name: (h.name as string) ?? null,
            avatarUrl: (h.avatar_url as string) ?? null,
            bio: (h.bio as string) ?? null,
            members: Number(h.members),
          }))}
        />
      </div>
    </Main>
  );
}
