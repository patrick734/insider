import type { Metadata } from "next";
import { Corners, Main, PageHeader } from "@/components/page";
import { Rail } from "@/components/rail";
import { SITE } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fee discounts" };

export default function Page() {
  return (
    <>
      <Main>
        <PageHeader title="Fee discounts" />
        <section className="panel art m-4 min-h-[200px] p-6 sm:m-5">
          <Corners />
          <span className="label">// FEES</span>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-soft">Swaps in rooms pay a 1% fee (60% host, 20% key holders, 20% {SITE.name}). Key trades pay 8% (4% host, 2% key holders, 2% {SITE.name}). Discounts for active hosts are coming.</p>
        </section>
      </Main>
      <Rail />
    </>
  );
}
