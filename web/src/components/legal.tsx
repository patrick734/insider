import { Corners } from "@/components/page";

export type Block = string | string[];
export type Clause = { id: string; title: string; body: Block[]; extra?: React.ReactNode };

/** Shared layout for the terms and privacy pages: a short summary, a numbered index, then the numbered sections. */
export function LegalDoc({ summary, clauses }: { summary: React.ReactNode[]; clauses: Clause[] }) {
  return (
    <>
      <section className="panel art m-4 p-6 sm:m-5">
        <Corners />
        <span className="label">// SHORT VERSION</span>
        <ul className="mt-3 max-w-xl space-y-1.5 text-[14.5px] leading-relaxed text-soft">
          {summary.map((s, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mono text-accent">›</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
        <p className="mono mt-4 text-[11px] text-muted">The full text below is what applies.</p>
      </section>

      <nav className="mx-4 mb-2 flex flex-wrap gap-x-3 gap-y-1.5 sm:mx-5">
        {clauses.map((c, i) => (
          <a key={c.id} href={`#${c.id}`} className="mono text-[11px] tracking-[0.06em] text-muted hover:text-accent-soft">
            {String(i + 1).padStart(2, "0")} {c.title.toUpperCase()}
          </a>
        ))}
      </nav>

      <article className="px-4 pb-10 sm:px-5">
        {clauses.map((c, i) => (
          <section key={c.id} id={c.id} className="scroll-mt-28 border-t border-accent/15 py-5">
            <h2 className="flex items-baseline gap-3 text-[16px] font-bold">
              <span className="mono text-[12px] text-accent">{String(i + 1).padStart(2, "0")}</span>
              {c.title}
            </h2>
            <div className="mt-2.5 space-y-2.5 text-[14.5px] leading-relaxed text-soft">
              {c.body.map((b, j) =>
                typeof b === "string" ? (
                  <p key={j}>{b}</p>
                ) : (
                  <ul key={j} className="space-y-1.5 pl-1">
                    {b.map((li, k) => (
                      <li key={k} className="flex gap-2.5">
                        <span className="mono text-accent">›</span>
                        <span>{li}</span>
                      </li>
                    ))}
                  </ul>
                ),
              )}
            </div>
            {c.extra}
          </section>
        ))}
      </article>
    </>
  );
}
