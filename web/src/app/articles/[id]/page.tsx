import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Corners, Main, PageHeader } from "@/components/page";
import { Rail } from "@/components/rail";
import { ArticleEditor } from "@/components/article-editor";
import { article } from "@/server/queries";
import { getMe } from "@/server/auth";
import { ago, displayName, profileHref } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const a = await article((await params).id);
  return a ? { title: a.title, description: a.dek ?? undefined } : { title: "Write an article" };
}

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === "new") {
    const me = await getMe();
    return (
      <>
        <Main>
          <PageHeader title="Write an article" back="/articles" />
          {me ? <ArticleEditor /> : <p className="px-5 py-10 text-center text-sm text-muted">Sign in to write.</p>}
        </Main>
        <Rail />
      </>
    );
  }
  const a = await article(id);
  if (!a) notFound();
  return (
    <>
      <Main>
        <PageHeader title="Article" back="/articles" />
        <article className="px-4 py-5 sm:px-6">
          <div className="art relative h-[160px] border border-accent/40 sm:h-[220px]">
            <Corners />
            <span className="mono absolute bottom-4 left-5 text-4xl font-bold text-text [text-shadow:0_0_24px_rgba(46,168,255,0.8)] sm:text-5xl">{a.coverLabel ?? a.tag}</span>
          </div>
          <span className="mono mt-4 block text-[10.5px] tracking-[0.14em] text-accent">{a.tag}</span>
          <h1 className="mt-1.5 text-[26px] font-bold leading-tight">{a.title}</h1>
          {a.dek && <p className="mt-2 text-base leading-relaxed text-[#9FB3C6]">{a.dek}</p>}
          <Link href={profileHref(a.user)} className="mono mt-4 flex items-center gap-2.5 text-xs text-muted">
            <Avatar user={a.user} size={30} on />
            <b className="font-sans text-sm text-text">{displayName(a.user)}</b> · {ago(a.publishedAt)}
          </Link>
          <div className="mt-6 space-y-4 whitespace-pre-wrap text-[16px] leading-[1.7] text-body">{a.body}</div>
        </article>
      </Main>
      <Rail />
    </>
  );
}
