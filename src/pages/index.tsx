import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { useWalletClient, useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { setXmtpClient, getXmtpClient } from "../lib/xmtp/store";
import { Button } from "../components/Button";
import styles from "../styles/Landing.module.css";

type InitState = "disconnected" | "initializing" | "ready" | "error";

export default function Home() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [initState, setInitState] = useState<InitState>("disconnected");
  const [errorMessage, setErrorMessage] = useState("");
  const initializingRef = useRef(false);
  const [dbCleanupDone, setDbCleanupDone] = useState(false);

  // Clean up any leftover XMTP databases on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const dbNames = ['xmtp_db', 'xmtpv3-dev', 'xmtpv3-production', 'xmtpv3-local'];
      let completed = 0;
      const total = dbNames.length;
      
      dbNames.forEach(dbName => {
        const deleteRequest = indexedDB.deleteDatabase(dbName);
        deleteRequest.onsuccess = () => {
          completed++;
          if (completed === total) {
            setDbCleanupDone(true);
          }
        };
        deleteRequest.onerror = () => {
          completed++;
          if (completed === total) {
            setDbCleanupDone(true);
          }
        };
        deleteRequest.onblocked = () => {
          completed++;
          if (completed === total) {
            setDbCleanupDone(true);
          }
        };
      });
      
      // Fallback: set cleanup done after 500ms regardless
      setTimeout(() => setDbCleanupDone(true), 500);
    } else {
      setDbCleanupDone(true);
    }
  }, []);

  // Check if already initialized on mount - if so, redirect to inbox
  useEffect(() => {
    const existingClient = getXmtpClient();
    if (existingClient) {
      router.replace("/inbox");
    }
  }, [router]);

  // Reset state when wallet disconnects
  useEffect(() => {
    if (!walletClient || !isConnected) {
      console.log('Wallet disconnected, resetting state...');
      setInitState("disconnected");
      setErrorMessage("");
      initializingRef.current = false;
    }
  }, [walletClient, isConnected]);

  // Auto-initialize when wallet connects
  useEffect(() => {
    // Wait for database cleanup to complete
    if (!dbCleanupDone) return;
    
    // Skip if not connected
    if (!walletClient || !isConnected) return;
    
    // Only auto-initialize if we're in disconnected state (fresh connect)
    // Not if we're already initializing, ready, or in error state
    if (initState !== "disconnected") return;

    // Prevent multiple simultaneous initializations
    if (initializingRef.current) return;

    initializeXmtp();
  }, [walletClient, isConnected, initState, dbCleanupDone]);

  async function initializeXmtp() {
    // Double check connection status before proceeding
    if (!walletClient || !isConnected) {
      console.log("Wallet not connected, aborting initialization");
      return;
    }
    if (initializingRef.current) return;

    initializingRef.current = true;
    setInitState("initializing");
    setErrorMessage("");

    console.log("Starting XMTP initialization...");

    try {
      // Dynamic import to avoid SSR issues
      console.log("Importing XMTP client...");
      const { createXmtpClient } = await import("../lib/xmtp/client");
      
      console.log("Creating XMTP client with wallet...");
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("XMTP initialization timed out. The network may be slow or unavailable. Please try again.")), 30000);
      });
      
      const xmtp = await Promise.race([
        createXmtpClient(walletClient),
        timeoutPromise
      ]);
      
      console.log("XMTP client created, checking inbox ID...");
      const id = xmtp.inboxId ?? "";
      if (!id) {
        throw new Error("Failed to create secure inbox identity.");
      }

      console.log("XMTP client ready, inbox ID:", id);
      // Store client for use in other pages
      setXmtpClient(xmtp);
      setInitState("ready");
      initializingRef.current = false;

      // Auto-redirect to inbox
      router.replace("/inbox");
    } catch (e) {
      console.error("XMTP initialization failed:", e);
      console.error("Error details:", JSON.stringify(e, null, 2));
      setErrorMessage(
        e instanceof Error ? e.message : "An unexpected error occurred."
      );
      setInitState("error");
      initializingRef.current = false;
    }
  }

  function handleRetry() {
    initializingRef.current = false;
    initializeXmtp();
  }

  return (
    <main className={styles.page}>
      {/* Background gradient */}
      <div className={styles.background} />

      {/* Main content */}
      <div className={styles.container}>
        {/* Logo / Branding */}
        <div className={styles.logoContainer}>
          <img src="/logo.png" alt="KeyTalk" className={styles.logo} />
          <h1 className={styles.title}>KeyTalk</h1>
          <p className={styles.tagline}>Encrypted wallet-to-wallet messaging</p>
        </div>

        {/* Card */}
        <div className={styles.card}>
          {/* Disconnected State */}
          {initState === "disconnected" && (
            <>
              <h2 className={styles.cardTitle}>Welcome to KeyTalk</h2>
              <p className={styles.cardSubtitle}>
                Connect your wallet to get started.
              </p>
              <div className={styles.connectWrapper}>
                <ConnectButton />
              </div>
              <p className={styles.note}>No phone number. No password.</p>
            </>
          )}

          {/* Initializing State */}
          {initState === "initializing" && (
            <>
              <h2 className={styles.cardTitle}>Setting up your inbox…</h2>
              <p className={styles.cardSubtitle}>
                This takes a moment the first time.
              </p>

              <div className={styles.spinnerContainer}>
                <div className={styles.spinner} />
              </div>

              <p className={styles.reassurance}>
                🔒 Your messages remain encrypted.
              </p>
            </>
          )}

          {/* Error State */}
          {initState === "error" && (
            <>
              <h2 className={styles.cardTitle}>Failed to initialize inbox</h2>
              <p className={styles.cardSubtitle} style={{ color: 'var(--danger)' }}>
                {errorMessage || "Something went wrong. Please try again."}
              </p>
              <Button variant="primary" onClick={handleRetry}>
                Retry
              </Button>
              <p className={styles.troubleshooting}>
                💡 Check your wallet connection or refresh the page.
              </p>
            </>
          )}

          {/* Ready State (brief - auto-redirects) */}
          {initState === "ready" && (
            <>
              <h2 className={styles.cardTitle}>You&apos;re all set!</h2>
              <p className={styles.cardSubtitle}>Redirecting to your inbox…</p>
              <div className={styles.spinnerContainer}>
                <div className={styles.spinner} />
              </div>
            </>
          )}
        </div>

        {/* Trust Features */}
        <div className={styles.features}>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>🔐</span>
            <span className={styles.featureText}>End-to-end encrypted</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>👛</span>
            <span className={styles.featureText}>Wallet-based identity</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>📵</span>
            <span className={styles.featureText}>No phone number required</span>
          </div>
        </div>

        {/* How it works */}
        <div className={styles.howItWorks}>
          <p className={styles.howItWorksTitle}>How it works</p>
          <div className={styles.steps}>
            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <p className={styles.stepText}>Connect wallet</p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <p className={styles.stepText}>Approve signature</p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <p className={styles.stepText}>Start chatting</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
