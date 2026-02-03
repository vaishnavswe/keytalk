'use client';

import type { Signer as XmtpSigner } from "@xmtp/browser-sdk";
import { IdentifierKind } from "@xmtp/browser-sdk";
import type { WalletClient } from "viem";
import { hexToBytes } from "viem";

export function walletClientToXmtpSigner(walletClient: WalletClient): XmtpSigner {
  const address = walletClient.account?.address;
  if (!address) throw new Error("No connected wallet address.");

  return {
    type: "EOA",
    getIdentifier: () => ({
      identifier: address,
      identifierKind: IdentifierKind.Ethereum,
    }),
    signMessage: async (message: string): Promise<Uint8Array> => {
      const sigHex = await walletClient.signMessage({
        account: walletClient.account!,
        message,
      });
      return hexToBytes(sigHex);
    },
  };
}
