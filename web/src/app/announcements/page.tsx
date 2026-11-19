import type { Metadata } from "next";
import { LogoMark } from "@/components/icons";
import { Corners, Empty, Main, PageHeader } from "@/components/page";
import { Rail } from "@/components/rail";
import { PostList } from "@/components/post";
import { getMe } from "@/server/auth";
import { officialAccount, officialPosts } from "@/server/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Announcements" };

export default async function Announcements() {
  const me = await getMe();
  const [account, posts] = await Promise.all([officialAccount(), officialPosts(me?.id ?? null)]);
  return (
    <>
      <Main>
        <PageHeader title="Announcements" sub="OFFICIAL UPDATES FROM THE INSIDER TEAM" />
        {account && (
          <section className="panel mx-4 my-4 flex items-center gap-3.5 p-4 sm:mx-5">
            <Corners />
            <span className="grid h-[52px] w-[52px] flex-none place-items-center bg-accent shadow-[0_0_18px_rgba(46,168,255,0.55)]">
              <LogoMark size={26} color="#00111F" glow={false} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2">
                <b className="text-[17px]">Insider</b>
                <span className="mono bg-accent px-1.5 text-[9.5px] font-bold tracking-[0.12em] text-on-accent">OFFICIAL</span>
              </span>
              <span className="mono truncate text-[11.5px] text-muted">@{account.handle} · product news, payouts and events</span>
            </span>
            <Link href={`/u/${account.handle}`} className="btn btn-on">
              FOLLOW
            </Link>
          </section>
        )}
        <div className="border-t border-line" />
        {posts.length ? <PostList posts={posts} /> : <Empty title="// NO ANNOUNCEMENTS YET" />}
      </Main>
      <Rail />
    </>
  );
}
