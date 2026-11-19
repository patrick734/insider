import type { Metadata } from "next";
import { Corners, Main, PageHeader } from "@/components/page";
import { Rail } from "@/components/rail";

export const metadata: Metadata = { title: "Invite & earn" };

export default function Page() {
  return (
    <>
      <Main>
        <PageHeader title="Invite & earn" />
        <section className="panel art m-4 min-h-[200px] p-6 sm:m-5">
          <Corners />
          <span className="label">// FEE SHARE</span>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-soft">Invite hosts and traders. Once someone you invited stays and trades, you earn a share of the swap fees they pay. Paid in fee share, never in points.</p>
        </section>
      </Main>
      <Rail />
    </>
  );
}
