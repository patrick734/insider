import type { Metadata } from "next";
import { Main, PageHeader } from "@/components/page";
import { Rail } from "@/components/rail";
import { SettingsForm } from "@/components/settings-form";
import { getMe } from "@/server/auth";
import { sql } from "@insider/core";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

export default async function Settings() {
  const me = await getMe();
  const [row] = me ? await sql()`select pnl_visible from users where id = ${me.id}` : [];
  return (
    <>
      <Main>
        <PageHeader title="Settings" />
        {me ? (
          <SettingsForm me={me} pnlVisible={Boolean(row?.pnl_visible)} />
        ) : (
          <p className="px-5 py-10 text-center text-sm text-muted">Sign in to edit your profile.</p>
        )}
      </Main>
      <Rail />
    </>
  );
}
