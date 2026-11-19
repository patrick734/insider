import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sql } from "@insider/core";
import { Main, PageHeader } from "@/components/page";
import { Rail } from "@/components/rail";
import { PostCard, PostList } from "@/components/post";
import { ReplyBox } from "@/components/reply-box";
import { getMe } from "@/server/auth";
import { thread } from "@/server/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Post" };

/** A post and its replies. */
export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const me = await getMe();
  const all = await thread(id, me?.id ?? null);
  if (!all.length || all[0].id !== id) notFound();
  await sql()`update posts set view_count = view_count + 1 where id = ${id}`;
  const [post, ...replies] = all;
  return (
    <>
      <Main>
        <PageHeader title="Post" back="/" />
        <PostCard post={post} />
        <ReplyBox postId={post.id} />
        <PostList posts={replies} compactCards />
      </Main>
      <Rail />
    </>
  );
}
