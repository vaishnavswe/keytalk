'use client';

import { Client } from "@xmtp/browser-sdk";
import type { WalletClient } from "viem";
import { walletClientToXmtpSigner } from "./signer";

export async function createXmtpClient(walletClient: WalletClient) {
  const signer = walletClientToXmtpSigner(walletClient);

  // Use production network for better reliability
  const client = await Client.create(signer, {
    env: "production",
    appVersion: "keytalk/0.1",
  });

  return client;
}
