import { redirect } from "next/navigation";

/** Invites now run through the founder waitlist (personal link, verified invites, leaderboard). */
export default function Invite() {
  redirect("/waitlist");
}
