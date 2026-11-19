import Link from "next/link";
import type { Metadata } from "next";
import { Avatar } from "@/components/avatar";
import { Corners, Empty, Main, PageHeader } from "@/components/page";
import { Rail } from "@/components/rail";
import { Icon } from "@/components/icons";
import { articles } from "@/server/queries";
import { ago, compact, displayName, eth } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Articles" };

/** Stable art position per article, so each cover looks different but never changes. */
const art = (id: string, i: number) => ({ ["--x" as string]: `${[20, 75, 40, 85, 55][(Number(id) + i) % 5]}%`, ["--y" as string]: `${[30, 20, 80, 60, 10][Number(id) % 5]}%`, ["--a" as string]: `${30 + (Number(id) % 6) * 25}deg` });

export default async function Articles() {
  const list = await articles(30);
  const [feat, ...rest] = list;
  return (
    <>
      <Main>
        <PageHeader
          title="Articles"
          right={
            <Link href="/articles/new" className="btn btn-on">
              <Icon name="pen" size={14} />
              WRITE
            </Link>
          }
        />
        {!feat && <Empty title="// NO ARTICLES YET">Hosts write here about how they run rooms, price keys and read the market.</Empty>}
        {feat && (
          <article className="border-b border-line px-4 py-4 sm:px-5">
            <Link href={`/articles/${feat.id}`} className="art relative block h-[180px] border border-accent/40 sm:h-[230px]" style={art(feat.id, 0)}>
              <Corners />
              <span className="mono absolute bottom-4 left-5 text-[34px] font-bold tracking-[0.04em] text-text [text-shadow:0_0_24px_rgba(46,168,255,0.8)] sm:text-[52px]">{feat.coverLabel ?? feat.tag}</span>
              <span className="label absolute right-4 top-3.5">// FEATURED</span>
            </Link>
            <span className="mono mt-3.5 block text-[10.5px] tracking-[0.14em] text-accent">{feat.tag}</span>
            <Link href={`/articles/${feat.id}`} className="text-text hover:text-text">
              <h2 className="mt-1.5 text-[22px] font-bold leading-tight sm:text-2xl">{feat.title}</h2>
            </Link>
            {feat.dek && <p className="mt-2 text-[15px] leading-relaxed text-[#9FB3C6]">{feat.dek}</p>}
            <div className="mono mt-3.5 flex items-center gap-2.5 text-[11.5px] text-muted">
              <Avatar user={feat.user} size={28} on />
              <b className="font-sans text-sm font-semibold text-text">{displayName(feat.user)}</b>@{feat.user.handle} · {ago(feat.publishedAt)}
              <span className="flex-1" />
              ♥ {compact(feat.likeCount)}
              {BigInt(feat.tipWei) > 0n && <span className="border border-accent/35 px-2 py-0.5 text-accent-soft">Ξ {eth(feat.tipWei, { symbol: false })}</span>}
            </div>
          </article>
        )}
        {rest.map((a, i) => (
          <Link key={a.id} href={`/articles/${a.id}`} className="flex gap-4 border-b border-line px-4 py-4 text-text hover:text-text sm:px-5">
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="mono flex items-center gap-2 text-[11px] text-muted">
                <Avatar user={a.user} size={22} />
                {displayName(a.user)} · {ago(a.publishedAt)}
              </span>
              <b className="text-[17px] font-bold leading-snug">{a.title}</b>
              {a.dek && <span className="line-clamp-2 text-sm leading-normal text-[#9FB3C6]">{a.dek}</span>}
              <span className="mono text-[10.5px] tracking-[0.1em] text-dim">
                {a.tag} · ♥ {compact(a.likeCount)}
              </span>
            </span>
            <span className="art relative h-[84px] w-[110px] flex-none border border-accent/35 sm:h-[104px] sm:w-[150px]" style={art(a.id, i + 1)}>
              <span className="mono absolute bottom-1.5 left-2.5 text-lg font-bold text-text [text-shadow:0_0_14px_rgba(46,168,255,0.8)] sm:text-2xl">{a.coverLabel ?? a.tag}</span>
            </span>
          </Link>
        ))}
      </Main>
      <Rail />
    </>
  );
}
