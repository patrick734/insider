import type { Metadata } from "next";
import { Corners, Main, PageHeader } from "@/components/page";
import { Rail } from "@/components/rail";

export const metadata: Metadata = { title: "Launch a coin" };

export default function Page() {
  return (
    <>
      <Main>
        <PageHeader title="Launch a coin" />
        <section className="panel art m-4 min-h-[200px] p-6 sm:m-5">
          <Corners />
          <span className="label">// LATER</span>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-soft">Rooms will be able to launch their own community coin from a post. This comes after rooms are busy, so for now link any Base coin to your room.</p>
        </section>
      </Main>
      <Rail />
    </>
  );
}
