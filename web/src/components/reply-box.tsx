"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/lib/session";

export function ReplyBox({ postId }: { postId: string }) {
  const { me, login } = useSession();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reply = async () => {
    if (!me) return login();
    const r = await fetch("/api/posts", { method: "POST", body: JSON.stringify({ body, replyTo: postId }) });
    if (!r.ok) return setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't reply.");
    setBody("");
    router.refresh();
  };

  return (
    <div className="flex gap-2 border-b border-line px-4 py-3 sm:px-5">
      <input value={body} onChange={(e) => setBody(e.target.value.slice(0, 500))} onKeyDown={(e) => e.key === "Enter" && void reply()} placeholder="Post your reply" className="input min-w-0 flex-1" />
      <button disabled={!body.trim()} onClick={() => void reply()} className="btn btn-on h-10">
        REPLY
      </button>
      {error && <p className="mono text-[11px] text-accent-soft">{error}</p>}
    </div>
  );
}
