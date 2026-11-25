"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { chain } from "@insider/core/chain";
import { PRIVY_APP_ID, SITE, WALLETCONNECT_ID } from "@/lib/config";
import { DevSessionProvider, PrivySessionProvider, type Me } from "@/lib/session";

export function Providers({ children, me }: { children: React.ReactNode; me: Me | null }) {
  if (!PRIVY_APP_ID) return <DevSessionProvider initialMe={me}>{children}</DevSessionProvider>;
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "twitter", "farcaster", "wallet"],
        ...(WALLETCONNECT_ID ? { walletConnectCloudProjectId: WALLETCONNECT_ID } : {}),
        appearance: { theme: "dark", accentColor: "#2EA8FF", landingHeader: `Sign in to ${SITE.name}`, showWalletLoginFirst: false },
        // X and email sign-ins get a wallet in the background (no seed phrase). People who connect a wallet keep that
        // wallet as their account: no second wallet is made for them.
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        defaultChain: chain,
        supportedChains: [chain],
      }}
    >
      <PrivySessionProvider initialMe={me}>{children}</PrivySessionProvider>
    </PrivyProvider>
  );
}
