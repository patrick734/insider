import type { Metadata } from "next";
import { Corners, Main, PageHeader } from "@/components/page";
import { Rail } from "@/components/rail";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Terms" };

export default function Page() {
  return (
    <>
      <Main>
        <PageHeader title="Terms" />
        <section className="panel art m-4 min-h-[200px] p-6 sm:m-5">
          <Corners />
          <span className="label">// TERMS</span>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-soft">The full terms are being written and will be published here before public launch.</p>
        </section>
      </Main>
      <Rail />
    </>
  );
}
