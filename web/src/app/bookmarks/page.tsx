import type { Metadata } from "next";
import { Corners, Main, PageHeader } from "@/components/page";
import { Rail } from "@/components/rail";

export const metadata: Metadata = { title: "Bookmarks" };

export default function Page() {
  return (
    <>
      <Main>
        <PageHeader title="Bookmarks" />
        <section className="panel art m-4 min-h-[200px] p-6 sm:m-5">
          <Corners />
          <span className="label">// SAVED POSTS</span>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-soft">Posts you bookmark will show here.</p>
        </section>
      </Main>
      <Rail />
    </>
  );
}
