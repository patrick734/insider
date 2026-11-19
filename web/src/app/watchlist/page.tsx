import type { Metadata } from "next";
import { Corners, Main, PageHeader } from "@/components/page";
import { Rail } from "@/components/rail";

export const metadata: Metadata = { title: "Watchlist" };

export default function Page() {
  return (
    <>
      <Main>
        <PageHeader title="Watchlist" />
        <section className="panel art m-4 min-h-[200px] p-6 sm:m-5">
          <Corners />
          <span className="label">// SHARED WATCHLISTS</span>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-soft">Watch coins on your own or with your room. Room watchlists show to everyone in the room.</p>
        </section>
      </Main>
      <Rail />
    </>
  );
}
