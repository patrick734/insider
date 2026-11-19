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
  return (
    <Main>
      <div className="mx-auto max-w-lg px-4 py-10 sm:px-5">
        <LogoMark size={44} />
        <h1 className="mt-5 text-[28px] font-bold leading-tight">Welcome to {SITE.name}.</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-soft">{SITE.tagline} Pick a handle, follow a few hosts, then step into a room.</p>
        <WelcomeForm
          me={{ handle: me.handle ?? "", name: me.name ?? "" }}
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
