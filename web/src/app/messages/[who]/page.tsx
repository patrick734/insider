import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Main } from "@/components/page";
import { DmClient } from "@/components/dm-client";
import { getMe } from "@/server/auth";
import { dmWith, userByHandleOrAddress } from "@/server/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Messages" };

export default async function Dm({ params }: { params: Promise<{ who: string }> }) {
  const me = await getMe();
  if (!me) redirect("/");
  const other = await userByHandleOrAddress((await params).who);
  if (!other || other.id === me.id) notFound();
  const { messages } = await dmWith(me.id, other.id);
  return (
    <Main wide>
      <DmClient other={other} initial={messages} />
    </Main>
  );
}
