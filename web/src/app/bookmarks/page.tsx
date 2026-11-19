import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Empty, Main, PageHeader } from "@/components/page";
import { Rail } from "@/components/rail";
import { PostList } from "@/components/post";
import { getMe } from "@/server/auth";
import { bookmarked } from "@/server/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bookmarks" };

export default async function Bookmarks() {
  const me = await getMe();
  if (!me) redirect("/");
  const posts = await bookmarked(me.id);
  return (
    <>
      <Main>
        <PageHeader title="Bookmarks" sub="ONLY YOU CAN SEE THESE" />
        {posts.length ? <PostList posts={posts} /> : <Empty title="// NOTHING SAVED YET">Tap the bookmark on any post to keep it here.</Empty>}
      </Main>
      <Rail />
    </>
  );
}
