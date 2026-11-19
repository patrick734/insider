import Link from "next/link";

export type TabLink = { label: string; href: string; selected: boolean };

/** Sticky page header with an optional row of tabs (links, so each tab has its own URL). */
export function PageHeader({ title, sub, right, tabs, back }: { title: React.ReactNode; sub?: string; right?: React.ReactNode; tabs?: TabLink[]; back?: string }) {
  return (
    <header className="sticky top-[52px] z-20 border-b border-accent/22 bg-black/90 backdrop-blur lg:top-0">
      <div className={`flex items-center justify-between gap-3 px-4 pt-3.5 sm:px-5 sm:pt-4 ${tabs ? "" : "pb-3.5"}`}>
        <div className="flex min-w-0 items-center gap-3">
          {back && (
            <Link href={back} aria-label="Back" className="mono text-lg text-text">
              ←
            </Link>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-[19px] font-bold sm:text-[21px]">{title}</h1>
            {sub && <span className="mono mt-0.5 block text-[10.5px] tracking-[0.06em] text-muted">{sub}</span>}
          </div>
        </div>
        {right}
      </div>
      {tabs && <Tabs tabs={tabs} className="mt-1.5" />}
    </header>
  );
}

export function Tabs({ tabs, className = "", stretch = false }: { tabs: TabLink[]; className?: string; stretch?: boolean }) {
  return (
    <nav role="tablist" className={`no-scrollbar flex overflow-x-auto px-1.5 sm:px-2 ${className}`}>
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} role="tab" aria-selected={t.selected} className={`tab ${stretch ? "flex-1 text-center" : ""}`} scroll={false}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** The center column. `wide` drops the 680px cap (rooms, chats). */
export function Main({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className={`min-w-0 flex-1 border-accent/18 bg-black/55 pb-24 lg:border-r lg:pb-0 ${wide ? "" : "lg:max-w-[680px]"}`}>{children}</main>
  );
}

export function Section({ label, right, children }: { label: string; right?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center justify-between px-4 pb-2.5 pt-5 sm:px-5">
        <span className="label">{label}</span>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="px-5 py-14 text-center">
      <p className="label">{title}</p>
      {children && <div className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">{children}</div>}
    </div>
  );
}

export const BaseChip = () => (
  <span className="mono inline-flex h-7 items-center gap-1.5 border border-accent/35 px-2.5 text-[10.5px] tracking-[0.14em] text-accent-soft">
    <span className="dot !h-1.5 !w-1.5" />
    BASE
  </span>
);

export const Corners = () => (
  <>
    <i className="corner tl" />
    <i className="corner br" />
  </>
);
