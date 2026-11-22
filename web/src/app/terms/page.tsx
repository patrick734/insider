import type { Metadata } from "next";
import Link from "next/link";
import { Corners, Main, PageHeader } from "@/components/page";
import { Rail } from "@/components/rail";
import { SITE } from "@/lib/config";
import { ADDRESSES, CHAIN_ID } from "@insider/core";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Terms" };

const UPDATED = "22 November 2026";
const SCAN = CHAIN_ID === 8453 ? "https://basescan.org" : "https://sepolia.basescan.org";
const CONTRACTS = (
  [
    ["RoomKeys", ADDRESSES.keys],
    ["RoomAccess", ADDRESSES.roomAccess],
    ["SplitterFactory", ADDRESSES.splitterFactory],
  ] as const
).filter(([, a]) => a);

type Block = string | string[];
type Clause = { id: string; title: string; body: Block[] };

function clauses(): Clause[] {
  const n = SITE.name;
  const we = SITE.legal.entity ? `${SITE.legal.entity} (“${n}”, “we”, “us”)` : `the team that runs ${n} (“${n}”, “we”, “us”)`;
  const contact = SITE.legal.email ? `email ${SITE.legal.email}` : `message @${SITE.xHandle} on X`;

  const list: Clause[] = [
    {
      id: "agreement",
      title: "These terms",
      body: [
        `These terms are an agreement between you and ${we}. They cover ${SITE.domain}, its apps, its waitlist and the interface it gives you to the ${n} smart contracts on Base (together, the “Service”). By using the Service you accept them. If you don't, please don't use it.`,
        `How we handle your data is in the Privacy Policy, which is part of these terms.`,
      ],
    },
    {
      id: "eligibility",
      title: "Who can use it",
      body: [
        "You must be at least 18 and able to enter a binding contract where you live. You may not use the Service if:",
        [
          "you are on a sanctions list (for example the US OFAC list, or UN, EU or UK lists), or act for someone who is;",
          "you are in a country or region under comprehensive sanctions;",
          "using it would break a law that applies to you.",
        ],
        "We may block access from places where we decide not to offer the Service.",
      ],
    },
    {
      id: "what",
      title: "What the Service is",
      body: [
        `${n} is software. It lets you sign in, chat in rooms for coins on Base, post calls, trade room keys and swap coins. The keys, fee-sharing and access rules run in public smart contracts on Base that anyone can read and use directly. The Service is one way to reach them.`,
        `${n} is non-custodial. We never hold your coins, ETH or keys, and we never ask for your seed phrase or private key. Anyone who does is not us. Every transaction is signed by you in your own wallet and settles on Base. Once confirmed it can't be reversed by us or anyone else.`,
      ],
    },
    {
      id: "account",
      title: "Your account and wallet",
      body: [
        "You sign in with a wallet or with X through Privy, a third-party sign-in provider. You are responsible for your wallet, your devices and everything done with them. One person, one account.",
        "Keep your handle honest: don't pretend to be someone else, a project or a team.",
      ],
    },
    {
      id: "waitlist",
      title: "Waitlist and founders",
      body: [
        "Before public launch the Service may be open only to people we let in from the waitlist.",
        [
          "One spot per X account. The first 200 verified members get a founder number.",
          "Founders get a badge and early access. Nothing else: there is no token, no points to redeem and no airdrop.",
          "Invites count only when the person invited verifies. We review the leaderboard and may hold, reset or remove ranks, invites or founder numbers that come from fake or duplicate accounts, self-referrals, automation or anything else that games it.",
          "Founder numbers, ranks and access can't be sold or transferred.",
          "Joining is free. We may change or end the waitlist at any time.",
        ],
      ],
    },
    {
      id: "keys",
      title: "Room keys",
      body: [
        "A room key is an on-chain item from the RoomKeys contract. It gives access to a room and a share of that room's fees while you hold it. It is not a share in a coin, a room or in us. It is not a promise of any payment or return. What key holders receive depends entirely on activity in the room, and it can be nothing.",
        "The contract sets the price on a fixed curve: it rises as keys are bought and falls as they are sold. The rules below are written into the contracts and apply to everyone:",
        [
          "Key trades pay an 8% fee: 4% to the room's host, 2% to the room's key holders and 2% to us.",
          "Selling within 24 hours of your last buy in that room adds a flip fee. It starts at 4% and falls to 0 over the 24 hours, and it goes to the room's key holders.",
          "Rewards to key holders are paid out gradually over 3 days.",
          "After you buy you can't sell that room's keys for 30 minutes.",
          "Each buy is capped at 5 keys, and at 10% of the room's keys in existence (at least 1).",
          "Just after a room opens, only its host can buy for a few minutes. The host's first key can never be sold.",
          "We can change fee splits only within limits set in the contract (never above 10% in total), and every change waits 2 days before it applies. The contract shows it publicly during that time.",
        ],
      ],
    },
    {
      id: "swaps",
      title: "Swaps",
      body: [
        "Swaps in rooms are routed through third-party liquidity (for example 0x and the pools it reaches). They pay a 1% fee: 60% to the room's host, 20% to its key holders and 20% to us. Prices move between quote and confirmation, and your swap settles within the slippage you accept in your wallet. We don't control those third-party protocols or the coins traded.",
      ],
    },
    {
      id: "content",
      title: "Calls, posts and your content",
      body: [
        "Calls, posts, messages and room descriptions are the views of the people who write them, not ours. A call's receipt shows on-chain prices: the market cap when it was posted and now. A receipt, a win rate or a badge is not an endorsement of the person or the coin.",
        `You keep ownership of what you post. You give ${n} a worldwide, royalty-free licence to host, show, copy and share it as part of running and promoting the Service. The licence ends when you delete it, except for copies others have already shared or that we keep for legal reasons.`,
        "You must have the right to post what you post.",
      ],
    },
    {
      id: "rules",
      title: "What you may not do",
      body: [
        "Don't use the Service to:",
        [
          "manipulate a market, including pump-and-dumps, coordinated dumping on followers, wash trading or spoofing;",
          "promote a coin without saying you were paid to;",
          "scam or phish people, post fake links, or ask anyone for seed phrases or keys;",
          "harass, threaten, dox or impersonate anyone, or post illegal, sexual or violent content involving minors, or hateful content;",
          "run bots, scrapers or fake accounts, or game the waitlist, rankings or receipts;",
          "get around sanctions, blocks or bans;",
          "attack, overload or reverse-engineer the Service.",
        ],
        `If you find a security bug, tell us (${contact}) and don't exploit it.`,
      ],
    },
    {
      id: "moderation",
      title: "Moderation and ending access",
      body: [
        "We may remove content, hide rooms or coins, and limit or end anyone's access to the Service, with or without notice, if we think these terms or the law require it or people are at risk.",
        "We can't freeze or take your on-chain assets. Your keys and coins stay in your wallet, and the contracts remain usable directly on Base.",
        "You can stop using the Service at any time.",
      ],
    },
    {
      id: "advice",
      title: "No advice",
      body: [
        "Nothing on the Service is financial, investment, tax or legal advice, from us or from other users. We don't act as your broker, adviser or fiduciary. Your decisions are your own.",
      ],
    },
    {
      id: "risks",
      title: "Risks",
      body: [
        "Using crypto and smart contracts carries risks we can't remove. These include:",
        [
          "prices that move fast, including to zero, and thin liquidity;",
          "bugs in contracts, wallets or third-party protocols;",
          "network congestion or outages on Base;",
          "lost keys and mistyped addresses;",
          "scams by other users;",
          "laws and taxes that change.",
        ],
        "The contracts have been tested but not audited by a third party. You are responsible for any tax on your activity.",
      ],
    },
    {
      id: "third",
      title: "Other services",
      body: [
        "The Service relies on others: Base, your wallet, Privy for sign-in, X for linking accounts, 0x for swaps, GeckoTerminal for prices, and RPC providers. Their own terms apply to them. We aren't responsible for them, and prices or balances they report may be late or wrong.",
      ],
    },
    {
      id: "ip",
      title: "Our name and software",
      body: [
        `The ${n} name, logo, design and site code belong to us. You may use them to talk about the Service, but not in a way that suggests we endorse you or that you are us. Contract code published on Base stays under its stated licence.`,
      ],
    },
    {
      id: "disclaimer",
      title: "As is",
      body: [
        "The Service is provided as is and as available. To the extent the law allows, we make no promises that it will be uninterrupted, error-free or secure, or that any content on it is accurate. We disclaim all implied warranties, including merchantability, fitness for a purpose and non-infringement.",
      ],
    },
    {
      id: "liability",
      title: "Limits on our liability",
      body: [
        "To the extent the law allows, we aren't liable for indirect, incidental, special or consequential losses. That includes lost profits, lost data, and losses from trades, prices, contracts, third-party services or other users.",
        "Our total liability to you for any claim about the Service is limited to the greater of the fees we received from your activity in the 12 months before the claim, or US$100.",
        "Some places don't allow some of these limits. Where they don't, they apply as far as allowed.",
      ],
    },
    {
      id: "indemnity",
      title: "Your responsibility to us",
      body: [
        "If someone makes a claim against us because of your content, your use of the Service or your breach of these terms or the law, you will cover our reasonable losses and costs, including legal fees.",
      ],
    },
    {
      id: "changes",
      title: "Changes",
      body: [
        "We may update these terms. The date at the top shows the latest version. We'll announce big changes in the app or on X before they apply. If you keep using the Service after a change, you accept the new terms.",
        "If any part of these terms can't be enforced, the rest still applies. Not enforcing a part right away doesn't mean we give it up.",
      ],
    },
  ];
  if (SITE.legal.jurisdiction) {
    list.push({
      id: "law",
      title: "Governing law",
      body: [
        `These terms are governed by the laws of ${SITE.legal.jurisdiction}. Disputes go to its courts, unless the law where you live gives you the right to bring them elsewhere.`,
        `Before starting any claim, contact us and give us 30 days to try to sort it out.`,
      ],
    });
  }
  list.push({ id: "contact", title: "Contact", body: [`Questions about these terms: ${contact}.`] });
  return list;
}

export default function Page() {
  const list = clauses();
  return (
    <>
      <Main>
        <PageHeader title="Terms" sub={`LAST UPDATED ${UPDATED.toUpperCase()}`} />
        <section className="panel art m-4 p-6 sm:m-5">
          <Corners />
          <span className="label">// SHORT VERSION</span>
          <ul className="mt-3 max-w-xl space-y-1.5 text-[14.5px] leading-relaxed text-soft">
            <li>{SITE.name} is software on Base. We never hold your funds and never ask for your seed phrase.</li>
            <li>Keys give room access and a share of that room&rsquo;s fees, which can be nothing. They aren&rsquo;t investments.</li>
            <li>Calls are people&rsquo;s opinions, not advice.</li>
            <li>Founders get a badge and early access. No token, no points, no airdrop.</li>
            <li>Don&rsquo;t manipulate markets, scam or game the waitlist.</li>
          </ul>
          <p className="mono mt-4 text-[11px] text-muted">The full terms below are what apply.</p>
        </section>

        <nav className="mx-4 mb-2 flex flex-wrap gap-x-3 gap-y-1.5 sm:mx-5">
          {list.map((c, i) => (
            <a key={c.id} href={`#${c.id}`} className="mono text-[11px] tracking-[0.06em] text-muted hover:text-accent-soft">
              {String(i + 1).padStart(2, "0")} {c.title.toUpperCase()}
            </a>
          ))}
        </nav>

        <article className="px-4 pb-10 sm:px-5">
          {list.map((c, i) => (
            <section key={c.id} id={c.id} className="scroll-mt-28 border-t border-accent/15 py-5">
              <h2 className="flex items-baseline gap-3 text-[16px] font-bold">
                <span className="mono text-[12px] text-accent">{String(i + 1).padStart(2, "0")}</span>
                {c.title}
              </h2>
              <div className="mt-2.5 space-y-2.5 text-[14.5px] leading-relaxed text-soft">
                {c.body.map((b, j) =>
                  typeof b === "string" ? (
                    <p key={j}>{b}</p>
                  ) : (
                    <ul key={j} className="space-y-1.5 pl-1">
                      {b.map((li, k) => (
                        <li key={k} className="flex gap-2.5">
                          <span className="mono text-accent">›</span>
                          <span>{li}</span>
                        </li>
                      ))}
                    </ul>
                  ),
                )}
              </div>
              {c.id === "keys" && (
                <div className="mono mt-3 space-y-1 text-[11px] text-muted">
                  {CONTRACTS.map(([label, addr]) => (
                    <div key={addr} className="flex flex-wrap gap-x-2">
                      <span>{label}</span>
                      <a href={`${SCAN}/address/${addr}#code`} target="_blank" rel="noreferrer" className="break-all text-accent-soft">
                        {addr}
                      </a>
                    </div>
                  ))}
                </div>
              )}
              {c.id === "agreement" && (
                <p className="mt-2.5 text-[14.5px] text-soft">
                  <Link href="/privacy" className="text-accent-soft underline underline-offset-2">Privacy Policy →</Link>
                </p>
              )}
            </section>
          ))}
        </article>
      </Main>
      <Rail />
    </>
  );
}
