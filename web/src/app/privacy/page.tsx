import type { Metadata } from "next";
import { Corners, Main, PageHeader } from "@/components/page";
import { Rail } from "@/components/rail";
import { SITE } from "@/lib/config";

export const metadata: Metadata = { title: "Privacy" };

export default function Page() {
  return (
    <>
      <Main>
        <PageHeader title="Privacy" />
        <section className="panel art m-4 min-h-[200px] p-6 sm:m-5">
          <Corners />
          <span className="label">// PRIVACY</span>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-soft">The full privacy policy is being written and will be published here before public launch. {SITE.name} never asks for seed phrases or private keys.</p>
        </section>
      </Main>
      <Rail />
    </>
  );
}
