import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Empty, Main, PageHeader } from "@/components/page";
import { Rail } from "@/components/rail";
import { getMe } from "@/server/auth";
import { threads } from "@/server/queries";
import { ago } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Messages" };

const TABS = [
  ["room", "Room chats"],
  ["key", "Key chats"],
  ["dm", "DMs"],
] as const;

export default async function Messages({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await getMe();
  if (!me) redirect("/");
  const key = (await searchParams).tab;
  const tab = (TABS.find(([k]) => k === key)?.[0] ?? "key") as "room" | "key" | "dm";
  const all = await threads(me.id, me.address);
  const list = all.filter((t) => t.kind === tab);
  const unread = (k: string) => all.filter((t) => t.kind === k).reduce((n, t) => n + t.unread, 0);
  return (
    <>
      <Main>
        <PageHeader
          title="Messages"
          tabs={TABS.map(([k, label]) => ({ label: unread(k) ? `${label} · ${unread(k)}` : label, href: `/messages?tab=${k}`, selected: k === tab }))}
        />
        {list.length === 0 && (
          <Empty title={tab === "dm" ? "// NO DMS YET" : tab === "key" ? "// NO KEY CHATS YET" : "// NO ROOM CHATS YET"}>
            {tab === "dm"
              ? "Open someone's profile and tap Message."
              : tab === "key"
                ? "Buy someone's key to join their key chat. Your own key holders show up here too."
                : "Join a room from Explore and its chat lands here."}
          </Empty>
        )}
        <div>
          {list.map((t) => (
            <Link key={t.id} href={t.href} className="flex gap-3 border-b border-line px-4 py-3.5 text-text hover:bg-accent/4 hover:text-text sm:px-5">
              {t.tile && <Avatar user={t.tile} size={44} on={t.unread > 0} />}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex justify-between gap-2">
                  <b className="truncate font-semibold">{t.title}</b>
                  <span className="mono flex-none text-[11px] text-dim">{t.lastAt ? ago(t.lastAt) : ""}</span>
                </span>
                <span className="mono text-[10px] uppercase tracking-[0.06em] text-muted">{t.meta}</span>
                <span className="flex justify-between gap-2">
                  <span className="truncate text-[13.5px] text-[#9FB3C6]">{t.last ?? "No messages yet"}</span>
                  {t.unread > 0 && <span className="mono flex-none bg-accent px-1.5 text-[10px] font-bold text-on-accent">{t.unread}</span>}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </Main>
      <Rail />
    </>
  );
}
