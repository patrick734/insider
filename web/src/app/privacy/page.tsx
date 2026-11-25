import type { Metadata } from "next";
import Link from "next/link";
import { Main, PageHeader } from "@/components/page";
import { LegalDoc, type Clause } from "@/components/legal";
import { Rail } from "@/components/rail";
import { SITE } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Privacy" };

const UPDATED = "22 November 2026";

function clauses(): Clause[] {
  const n = SITE.name;
  const who = SITE.legal.entity ? `${SITE.legal.entity} (“${n}”, “we”, “us”)` : `the team that runs ${n} (“${n}”, “we”, “us”)`;
  const contact = SITE.legal.email ? `email ${SITE.legal.email}` : `message @${SITE.xHandle} on X`;

  return [
    {
      id: "about",
      title: "About this policy",
      body: [
        `This policy explains what ${who} collects when you use ${SITE.domain}, its apps and its waitlist, why, and the choices you have. ${n} is responsible for that data.`,
      ],
      extra: (
        <p className="mt-2.5 text-[14.5px] text-soft">
          <Link href="/terms" className="text-accent-soft underline underline-offset-2">Terms →</Link>
        </p>
      ),
    },
    {
      id: "collect",
      title: "What we collect",
      body: [
        "From you, when you use the Service:",
        [
          "Your wallet address, when you sign in with a wallet.",
          "Your X account, when you sign in with X: your X user ID and handle, profile photo (we keep a copy as your avatar until you change it), follower count, when the account was created, and whether it follows our X account.",
          "Your profile: handle, name, bio, photo and banner. Without a photo you get a generated avatar.",
          "What you post and do: posts, calls, room messages, articles, images, likes, reposts, tips, bookmarks, watchlists and rooms you join.",
          "Direct messages, stored so the people in the conversation can read them.",
          "Waitlist details: your invite code, who invited you, who you invited, your founder number and rank.",
        ],
        "Automatically:",
        [
          "A scrambled code made from your IP address when you join the waitlist. We keep the code, not the address, and use it to spot duplicate sign-ups from one network.",
          "Whether you're online in a room, held in memory only while you're connected.",
          "Basic server logs (such as IP address, time and page requested) for security, kept for a short time.",
        ],
        "From Base: your public on-chain activity with the coins, rooms and keys on the Service, such as key trades, swaps and coin balances. This is already public on the blockchain. We read it to show holdings, receipts and records.",
        "We don't collect seed phrases, private keys, ID documents, your contacts or your precise location.",
      ],
    },
    {
      id: "cookies",
      title: "Cookies and storage",
      body: [
        "We use only what the Service needs to work:",
        [
          "insider_session keeps you signed in for up to 30 days.",
          "insider_ref remembers the invite code you arrived with for 30 days, so the right person gets credit.",
          "Privy, our sign-in provider, stores its own sign-in data in your browser.",
        ],
        "No advertising cookies, and no third-party analytics or tracking.",
      ],
    },
    {
      id: "use",
      title: "How we use it",
      body: [
        [
          "To run the Service: sign you in, show your profile, rooms, posts, calls and receipts, and deliver messages and notifications.",
          "To run the waitlist: check your X follow, count verified invites, give out founder numbers and keep the leaderboard fair.",
          "To keep the Service safe: stop spam, fake accounts and abuse, moderate content and fix problems.",
          "To share news about the Service in the app and on our X account.",
          "To meet legal requirements.",
        ],
        "We don't sell your data, and we don't use it for advertising.",
      ],
    },
    {
      id: "public",
      title: "What others can see",
      body: [
        [
          "Your profile, posts, calls and their receipts, your key holdings and your record are public.",
          "Room messages are visible to the room's members.",
          "Direct messages are visible to the people in the conversation.",
          "Your handle, founder number and rank can appear on the waitlist leaderboard and share cards.",
          "Anything you do on Base is public on the blockchain, whether or not you use the Service.",
        ],
      ],
    },
    {
      id: "share",
      title: "Who we share it with",
      body: [
        "Only with the services that help us run the Service, and only what each one needs:",
        [
          "Privy, for sign-in.",
          "X, to look up your X account and check your follow.",
          "Amazon Web Services, which hosts our servers.",
          "0x, which receives your wallet address when you ask for a swap price.",
          "Base network providers, which your browser and our servers query for on-chain data.",
        ],
        "We may also share data if the law requires it, to protect people's safety or our rights, or as part of a merger or sale of the Service (and we'll tell you if that happens).",
      ],
    },
    {
      id: "where",
      title: "Where it's stored",
      body: [
        "Our servers are in the United States. If you use the Service from elsewhere, your data is handled there, with the protections in this policy.",
      ],
    },
    {
      id: "keep",
      title: "How long we keep it",
      body: [
        [
          "Account and profile data: while you have an account.",
          "After you ask us to delete your account, we delete it within 30 days. Database backups roll over every 14 days.",
          "Server logs: a short time, for security.",
          "We may keep some records longer where the law requires.",
        ],
        "On-chain activity is part of the public blockchain, so we can't change or delete it.",
      ],
    },
    {
      id: "rights",
      title: "Your choices and rights",
      body: [
        "You can edit your profile in the app at any time.",
        `You can also ask us to show you, correct, export or delete your data or posts, or to stop using it for a purpose: ${contact}. We'll reply within 30 days.`,
        "If you're in the EU or UK, you also have the right to complain to your data protection authority. We use your data to provide the Service you asked for, for our legitimate interests in keeping it safe and fair, and to meet legal duties.",
        "If you're in California, you have the right to know, delete and correct your data, and we don't sell or share it for advertising.",
      ],
    },
    {
      id: "security",
      title: "Security",
      body: [
        "Connections to the Service are encrypted (HTTPS). Access to data is limited to the people who run the Service, and IP addresses are stored only as scrambled codes.",
      ],
    },
    {
      id: "age",
      title: "Age",
      body: [`${n} is for people 18 and older. If you think someone younger has signed up, ${contact} and we'll remove their account.`],
    },
    {
      id: "changes",
      title: "Changes",
      body: ["If we change this policy, we'll update the date at the top and announce big changes in the app or on X before they apply."],
    },
    { id: "contact", title: "Contact", body: [`Questions or requests about your data: ${contact}.`] },
  ];
}

export default function Page() {
  return (
    <>
      <Main>
        <PageHeader title="Privacy" sub={`LAST UPDATED ${UPDATED.toUpperCase()}`} />
        <LegalDoc
          summary={[
            "We collect what the Service needs: your wallet or X account, your profile and what you post.",
            "No advertising, no trackers, and we never sell your data.",
            "We never ask for your seed phrase or private key.",
            "You can see, export or delete your data by asking us.",
          ]}
          clauses={clauses()}
        />
      </Main>
      <Rail />
    </>
  );
}
