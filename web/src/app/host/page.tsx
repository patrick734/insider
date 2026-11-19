import type { Metadata } from "next";
import Link from "next/link";
import { Corners, Main, PageHeader } from "@/components/page";
import { Rail } from "@/components/rail";
import { HostForm } from "@/components/host-form";
import { getMe } from "@/server/auth";
import { roomsOfHost } from "@/server/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Host a room" };

export default async function Host() {
  const me = await getMe();
  const rooms = me ? await roomsOfHost(me.id) : [];
  return (
    <>
      <Main>
        <PageHeader title="Host a room" sub="FOUNDING HOSTS" />
        <section className="panel mx-4 mt-4 p-5 sm:mx-5">
          <Corners />
          <span className="label">// HOW HOSTING PAYS</span>
          <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-body">
            {[
              "Your room's holders chat, call trades and swap the coin without leaving the room.",
              "Every in-app swap pays a 1% fee: 60% to you, 20% to your key holders, 20% to Insider.",
              "Open keys and you earn 4% of every key trade. Holders get the key chat and a share of room fees.",
              "Coin holders get in free at the balance you set. Keys are optional.",
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <span className="dot mt-1.5 flex-none" />
                {t}
              </li>
            ))}
          </ul>
        </section>
        {rooms.length > 0 && (
          <section className="mx-4 mt-4 sm:mx-5">
            <span className="label">// YOUR ROOMS</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {rooms.map((r) => (
                <Link key={r.id} href={`/rooms/${r.slug}`} className="btn btn-off">
                  {r.title}
                </Link>
              ))}
            </div>
          </section>
        )}
        <HostForm signedIn={!!me} hasHandle={!!me?.handle} />
      </Main>
      <Rail />
    </>
  );
}
