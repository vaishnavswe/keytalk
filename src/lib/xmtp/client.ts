'use client';

import { Client } from "@xmtp/browser-sdk";
import type { WalletClient } from "viem";
import { walletClientToXmtpSigner } from "./signer";

export async function createXmtpClient(walletClient: WalletClient) {
  const signer = walletClientToXmtpSigner(walletClient);

  // Use dev network for now. We can switch later.
  const client = await Client.create(signer, {
    env: "dev",
    appVersion: "keytalk/0.1",
  });

  return client;
}
