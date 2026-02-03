import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAccount, useWalletClient, useDisconnect } from "wagmi";
import type { Client, Conversation } from "@xmtp/browser-sdk";
import { ConsentState, IdentifierKind } from "@xmtp/browser-sdk";
import { getXmtpClient, clearXmtpClient, setXmtpClient } from "../lib/xmtp/store";
import { AppShell } from "../components/AppShell";
import { Sidebar } from "../components/Sidebar";
import { Modal } from "../components/Modal";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { useToast } from "../components/Toast";
import styles from "../components/Sidebar/Sidebar.module.css";

// Simple type for conversation items we display
interface ConversationItem {
  id: string;
  peerAddress?: string;
  nickname?: string;
  unreadCount?: number;
  lastMessage?: string;
  lastMessageTime?: Date;
}

export default function Inbox() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { showToast } = useToast();
  const { disconnect } = useDisconnect();
  const [client, setClient] = useState<Client | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [requests, setRequests] = useState<ConversationItem[]>([]);
  const [blockedConvos, setBlockedConvos] = useState<ConversationItem[]>([]);
  const [reconnecting, setReconnecting] = useState(false);
  const initializingRef = useRef(false);

  // Helper functions for read/unread tracking
  function getLastReadTime(convoId: string): Date | null {
    if (typeof window === 'undefined' || !address) return null;
    const key = `xmtp_lastread_${address}_${convoId}`;
    const stored = localStorage.getItem(key);
    return stored ? new Date(stored) : null;
  }

  function setLastReadTime(convoId: string, time: Date) {
    if (typeof window === 'undefined' || !address) return;
    const key = `xmtp_lastread_${address}_${convoId}`;
    localStorage.setItem(key, time.toISOString());
  }

  // Helper to track deleted conversations so we can force-check them
  function getDeletedConvoIds(): string[] {
    if (typeof window === 'undefined' || !address) return [];
    const key = `xmtp_deleted_${address}`;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  }

  function addDeletedConvoId(convoId: string) {
    if (typeof window === 'undefined' || !address) return;
    const key = `xmtp_deleted_${address}`;
    const deleted = getDeletedConvoIds();
    if (!deleted.includes(convoId)) {
      deleted.push(convoId);
      localStorage.setItem(key, JSON.stringify(deleted));
    }
  }

  function removeDeletedConvoId(convoId: string) {
    if (typeof window === 'undefined' || !address) return;
    const key = `xmtp_deleted_${address}`;
    const deleted = getDeletedConvoIds().filter(id => id !== convoId);
    localStorage.setItem(key, JSON.stringify(deleted));
  }

  // Helper to track blocked conversations (XMTP doesn't return them in list())
  function getBlockedConvoIds(): string[] {
    if (typeof window === 'undefined' || !address) return [];
    const key = `xmtp_blocked_${address}`;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  }

  function addBlockedConvoId(convoId: string) {
    if (typeof window === 'undefined' || !address) return;
    const key = `xmtp_blocked_${address}`;
    const blocked = getBlockedConvoIds();
    if (!blocked.includes(convoId)) {
      blocked.push(convoId);
      localStorage.setItem(key, JSON.stringify(blocked));
    }
  }

  function removeBlockedConvoId(convoId: string) {
    if (typeof window === 'undefined' || !address) return;
    const key = `xmtp_blocked_${address}`;
    const blocked = getBlockedConvoIds().filter(id => id !== convoId);
    localStorage.setItem(key, JSON.stringify(blocked));
  }

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"inbox" | "requests">("inbox");
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  
  // Rename modal state
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameConvoId, setRenameConvoId] = useState("");
  const [renameValue, setRenameValue] = useState("");

  // Helper functions for nicknames
  function getNickname(convoId: string): string | null {
    if (typeof window === 'undefined' || !address) return null;
    const key = `xmtp_nickname_${address}_${convoId}`;
    return localStorage.getItem(key);
  }

  function setNickname(convoId: string, nickname: string) {
    if (typeof window === 'undefined' || !address) return;
    const key = `xmtp_nickname_${address}_${convoId}`;
    if (nickname.trim()) {
      localStorage.setItem(key, nickname.trim());
    } else {
      localStorage.removeItem(key);
    }
  }

  // Auto-reconnect XMTP if client is missing but wallet is connected
  async function initializeXmtp() {
    if (!walletClient) return;
    if (initializingRef.current) return;

    initializingRef.current = true;
    setReconnecting(true);

    try {
      const { createXmtpClient } = await import("../lib/xmtp/client");
      const xmtp = await createXmtpClient(walletClient);

      const id = xmtp.inboxId ?? "";
      if (!id) {
        throw new Error("Failed to create secure inbox identity.");
      }

      setXmtpClient(xmtp);
      setClient(xmtp);
      setReconnecting(false);
      initializingRef.current = false;
      loadConversations(xmtp);
    } catch (e) {
      console.error("XMTP reconnection failed:", e);
      setReconnecting(false);
      initializingRef.current = false;
      // Redirect to home if reconnection fails
      router.replace("/");
    }
  }

  // Check for XMTP client on mount
  useEffect(() => {
    const xmtp = getXmtpClient();
    if (!xmtp) {
      // No client - try to auto-reconnect ONLY if wallet is connected
      if (walletClient && isConnected) {
        initializeXmtp();
      } else {
        // Wallet disconnected - don't try to reconnect, just set loading false
        setLoading(false);
        // Reset the ref so reconnection can work later
        initializingRef.current = false;
      }
      return;
    }
    
    // If we have a client but wallet disconnected, clear everything and redirect
    if (!isConnected) {
      clearXmtpClient();
      setClient(null);
      router.replace("/");
      return;
    }
    
    setClient(xmtp);
    loadConversations(xmtp);
    
    // Set up real-time message streaming
    let cancelled = false;
    
    async function streamMessages() {
      if (!xmtp) return;
      try {
        const stream = await xmtp.conversations.streamAllMessages();
        for await (const message of stream) {
          if (cancelled) break;
          // Reload conversations when new message arrives
          console.log('New message received, refreshing...');
          loadConversations(xmtp);
        }
      } catch (e) {
        console.error('Stream error:', e);
      }
    }
    
    streamMessages();
    
    return () => {
      cancelled = true;
    };
  }, [walletClient, isConnected]);

  async function loadConversations(xmtp: Client) {
    try {
      setLoading(true);
      setError("");

      // Sync conversations from network - this is critical!
      await xmtp.conversations.sync();

      // List all conversations
      const allConvos = await xmtp.conversations.list();
      
      console.log(`Total conversations found: ${allConvos.length}`);

      // Also check deleted conversations - they might have new messages
      const deletedIds = getDeletedConvoIds();
      console.log(`Checking ${deletedIds.length} deleted conversations for new messages...`);
      
      for (const deletedId of deletedIds) {
        try {
          const deletedConvo = await xmtp.conversations.getConversationById(deletedId);
          if (deletedConvo) {
            await deletedConvo.sync();
            // Check if it's not already in allConvos
            if (!allConvos.find(c => c.id === deletedId)) {
              // This shouldn't happen but just in case
              console.log(`Adding deleted conversation ${deletedId} to check list`);
            }
          }
        } catch (e) {
          console.error(`Failed to check deleted conversation ${deletedId}:`, e);
        }
      }
      
      // Re-list after syncing deleted convos
      const allConvosUpdated = await xmtp.conversations.list();

      // Separate into allowed (inbox), unknown (requests), and denied (blocked)
      const allowedConvos: ConversationItem[] = [];
      const requestConvos: ConversationItem[] = [];
      const blockedConvos: ConversationItem[] = [];
      
      for (const c of allConvosUpdated) {
        // Sync messages for each conversation to get latest
        await c.sync();
        
        const state = await c.consentState();
        console.log(`Conversation ${c.id} state: ${state}`);
        
        // Get latest messages for this conversation to check for new messages
        const messages = await c.messages({ limit: 10n });
        // Messages are returned oldest-first, so get the last one for the most recent
        const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;
        
        console.log(`Conversation ${c.id}: ${messages.length} messages, lastMessage content:`, lastMessage?.content);
        
        // Extract last message content - handle different content types
        let lastMessageContent = "";
        if (lastMessage) {
          if (typeof lastMessage.content === 'string') {
            lastMessageContent = lastMessage.content;
          } else if (lastMessage.content && typeof lastMessage.content === 'object') {
            // Handle structured content (like reactions, replies, etc.)
            const content = lastMessage.content as Record<string, unknown>;
            if ('text' in content && typeof content.text === 'string') {
              lastMessageContent = content.text;
            } else if ('content' in content && typeof content.content === 'string') {
              lastMessageContent = content.content;
            }
          }
        }
        
        console.log(`Conversation ${c.id}: lastMessageContent = "${lastMessageContent}"`);
        
        // Calculate unread count based on last read time
        const lastReadTime = getLastReadTime(c.id);
        let unreadCount = 0;
        const myInboxId = xmtp.inboxId;
        
        // Debug: log each message's sender
        console.log(`Conversation ${c.id}: myInboxId = ${myInboxId}`);
        messages.forEach((msg, i) => {
          console.log(`  Message ${i}: sender=${msg.senderInboxId}, content=${typeof msg.content === 'string' ? msg.content.substring(0, 20) : '[object]'}, sentAt=${msg.sentAt}`);
        });
        
        if (lastReadTime) {
          // Count messages from peer that are newer than lastReadTime
          const peerMessages = messages.filter(msg => msg.senderInboxId !== myInboxId);
          const unreadMessages = peerMessages.filter(msg => msg.sentAt && new Date(msg.sentAt) > lastReadTime);
          unreadCount = unreadMessages.length;
          console.log(`Conversation ${c.id}: ${peerMessages.length} peer messages, ${unreadCount} after lastReadTime (${lastReadTime.toISOString()})`);
        } else {
          // Never read - count all messages from peer
          unreadCount = messages.filter(msg => msg.senderInboxId !== myInboxId).length;
          console.log(`Conversation ${c.id}: No lastReadTime, ${unreadCount} unread from peer`);
        }
        
        console.log(`Conversation ${c.id}: FINAL unreadCount = ${unreadCount}`);
        
        // Get peer address for DMs
        let peerAddress: string | undefined;
        if ('peerInboxId' in c) {
          try {
            peerAddress = await c.peerInboxId();
          } catch (e) {
            // Not a DM or error getting peer
          }
        }
        
        const item: ConversationItem = { 
          id: c.id,
          peerAddress: peerAddress,
          nickname: getNickname(c.id) || undefined,
          unreadCount: unreadCount,
          lastMessage: lastMessageContent,
          lastMessageTime: lastMessage?.sentAt
        };
        
        // Sort conversations by consent state
        if (state === ConsentState.Allowed) {
          console.log(`Conversation ${c.id} → ALLOWED (inbox)`);
          allowedConvos.push(item);
        } else if (state === ConsentState.Unknown) {
          // Only show Unknown conversations in Requests if there's ANY message from the peer
          const hasPeerMessage = messages.some(msg => msg.senderInboxId !== xmtp.inboxId);
          console.log(`Conversation ${c.id} → UNKNOWN, has peer message: ${hasPeerMessage}`);
          if (hasPeerMessage) {
            requestConvos.push(item);
          }
          // If there's no message from peer (only our messages or empty), don't show it anywhere
        } else if (state === ConsentState.Denied) {
          console.log(`Conversation ${c.id} → DENIED (blocked)`);
          blockedConvos.push(item);
        } else {
          console.log(`Conversation ${c.id} → UNKNOWN STATE: ${state}`);
        }
      }

      console.log(`Results: ${allowedConvos.length} allowed, ${requestConvos.length} requests, ${blockedConvos.length} blocked`);
      
      // Also load blocked conversations from localStorage (XMTP doesn't return them)
      const blockedIds = getBlockedConvoIds();
      console.log(`Loading ${blockedIds.length} blocked conversations from localStorage...`);
      
      for (const blockedId of blockedIds) {
        // Skip if already in the list
        if (blockedConvos.some(c => c.id === blockedId)) continue;
        
        try {
          const blockedConvo = await xmtp.conversations.getConversationById(blockedId);
          if (blockedConvo) {
            await blockedConvo.sync();
            const messages = await blockedConvo.messages({ limit: 10n });
            // Messages are returned oldest-first, so get the last one for the most recent
            const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;
            
            // Extract content - handle different content types
            let msgContent = "";
            if (lastMessage) {
              if (typeof lastMessage.content === 'string') {
                msgContent = lastMessage.content;
              } else if (lastMessage.content && typeof lastMessage.content === 'object') {
                const content = lastMessage.content as Record<string, unknown>;
                if ('text' in content && typeof content.text === 'string') {
                  msgContent = content.text;
                } else if ('content' in content && typeof content.content === 'string') {
                  msgContent = content.content;
                }
              }
            }
            
            blockedConvos.push({
              id: blockedId,
              nickname: getNickname(blockedId) || undefined,
              unreadCount: 0,
              lastMessage: msgContent,
              lastMessageTime: lastMessage?.sentAt
            });
            console.log(`Added blocked conversation ${blockedId} from localStorage`);
          }
        } catch (e) {
          console.error(`Failed to load blocked conversation ${blockedId}:`, e);
          // Remove from localStorage if it no longer exists
          removeBlockedConvoId(blockedId);
        }
      }
      
      setConversations(allowedConvos);
      setRequests(requestConvos);
      setBlockedConvos(blockedConvos);
    } catch (e) {
      console.error("Failed to load conversations:", e);
      setError(e instanceof Error ? e.message : "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }

  async function handleAcceptRequest(convoId: string) {
    if (!client) return;
    
    try {
      const convo = await client.conversations.getConversationById(convoId);
      if (convo) {
        await convo.updateConsentState(ConsentState.Allowed);
        // Mark as read when accepting
        setLastReadTime(convoId, new Date());
        // Remove from deleted tracking if it was there
        removeDeletedConvoId(convoId);
        // Reload conversations to update lists
        await loadConversations(client);
      }
    } catch (e) {
      console.error("Failed to accept request:", e);
    }
  }

  async function handleDenyRequest(convoId: string) {
    if (!client) return;
    
    try {
      const convo = await client.conversations.getConversationById(convoId);
      if (convo) {
        console.log(`Denying conversation ${convoId}...`);
        await convo.updateConsentState(ConsentState.Denied);
        
        // Save to localStorage so we can show in blocked modal
        addBlockedConvoId(convoId);
        
        // Verify the state was set
        const newState = await convo.consentState();
        console.log(`After deny, consent state is: ${newState}`);
        
        // Reload conversations to update lists
        await loadConversations(client);
      }
    } catch (e) {
      console.error("Failed to deny request:", e);
    }
  }

  async function handleStartDm(addressToMessage: string) {
    if (!client || !addressToMessage.trim()) return;

    try {
      const addr = addressToMessage.trim();

      // Check if address is reachable on XMTP
      const canMessage = await client.canMessage([
        { identifier: addr, identifierKind: IdentifierKind.Ethereum },
      ]);

      if (!canMessage.get(addr.toLowerCase())) {
        // Still try to create conversation - they might create XMTP client later
        console.warn(`Address ${addr} not on XMTP yet, but creating conversation anyway`);
      }

      // Fetch or create DM conversation using identifier
      const dm = await client.conversations.createDmWithIdentifier(
        { identifier: addr, identifierKind: IdentifierKind.Ethereum }
      );

      // Check if this conversation was previously denied and reset it
      const currentState = await dm.consentState();
      if (currentState === ConsentState.Denied) {
        await dm.updateConsentState(ConsentState.Unknown);
      }

      // DON'T set consent to allowed - let it stay unknown so the receiver sees it as a request
      // The conversation will appear in your inbox when you send the first message
      
      // Navigate to the chat immediately so user can send first message
      router.push(`/chat/${dm.id}`);
    } catch (e) {
      console.error("Failed to start DM:", e);
      showToast(e instanceof Error ? e.message : "Failed to start DM", "error");
    }
  }

  async function handleDeleteConversation(convoId: string) {
    if (!client) return;
    
    try {
      const convo = await client.conversations.getConversationById(convoId);
      if (convo) {
        // Track this conversation so we can check it for new messages later
        addDeletedConvoId(convoId);
        // Delete just resets to Unknown - it will reappear in requests if they message again
        await convo.updateConsentState(ConsentState.Unknown);
        // Reload conversations to update the list
        await loadConversations(client);
      }
    } catch (e) {
      console.error("Failed to delete conversation:", e);
    }
  }

  async function handleUnblockConversation(convoId: string) {
    if (!client) return;
    
    try {
      const convo = await client.conversations.getConversationById(convoId);
      if (convo) {
        // Remove from blocked localStorage
        removeBlockedConvoId(convoId);
        // Set consent back to unknown so it appears in requests
        await convo.updateConsentState(ConsentState.Unknown);
        // Reload conversations to update the lists
        await loadConversations(client);
      }
    } catch (e) {
      console.error("Failed to unblock conversation:", e);
    }
  }

  function openRenameModal(convoId: string, currentName?: string) {
    setRenameConvoId(convoId);
    setRenameValue(currentName || "");
    setRenameModalOpen(true);
  }

  function handleRename() {
    if (!renameConvoId) return;
    // If blank, this will remove the nickname (clear it)
    setNickname(renameConvoId, renameValue.trim());
    setRenameModalOpen(false);
    setRenameConvoId("");
    setRenameValue("");
    // Update the UI by reloading
    if (client) {
      loadConversations(client);
    }
  }

  function handleDisconnect() {
    clearXmtpClient();
    setClient(null);
    disconnect();
    router.push("/").then(() => {
      // Refresh the page after navigation to clear all state
      window.location.reload();
    });
  }

  // If reconnecting, show loading state
  if (reconnecting) {
    return (
      <AppShell>
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          height: '100%',
          gap: 'var(--space-md)'
        }}>
          <img src="/logo.png" alt="KeyTalk" className={styles.animatedLogo} />
          <p style={{ color: 'var(--text-secondary)' }}>Reconnecting...</p>
        </div>
      </AppShell>
    );
  }

  // If no XMTP client and wallet not connected, redirect to home
  if (!client && !loading) {
    // Silently redirect - don't show error
    if (typeof window !== 'undefined') {
      router.replace("/");
    }
    return (
      <AppShell>
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          height: '100%',
          gap: 'var(--space-md)'
        }}>
          <img src="/logo.png" alt="KeyTalk" className={styles.animatedLogo} />
          <p style={{ color: 'var(--text-secondary)' }}>Redirecting...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      sidebar={
        <Sidebar
          conversations={conversations}
          requests={requests}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          loading={loading}
          address={address}
          inboxId={client?.inboxId}
          onNewDm={handleStartDm}
          onAcceptRequest={handleAcceptRequest}
          onDenyRequest={handleDenyRequest}
          onDeleteConversation={handleDeleteConversation}
          onRenameConversation={openRenameModal}
          onBlockedClick={() => setShowBlockedModal(true)}
          blockedCount={blockedConvos.length}
          onDisconnect={handleDisconnect}
        />
      }
    >
      {/* Welcome / Empty State for inbox page */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        textAlign: 'center',
        padding: 'var(--space-xl)',
        color: 'var(--text-secondary)'
      }}>
        <img src="/logo.png" alt="KeyTalk" className={styles.animatedLogo} />
        <h2 style={{ margin: 0, color: 'var(--text)', fontWeight: 600 }}>Select a conversation</h2>
        <p style={{ margin: 'var(--space-sm) 0 0 0' }}>
          Choose an existing chat from the sidebar or start a new DM
        </p>
      </div>

      {/* Blocked Accounts Modal */}
      <Modal
        isOpen={showBlockedModal}
        onClose={() => setShowBlockedModal(false)}
        title={`Blocked Accounts (${blockedConvos.length})`}
      >
        {blockedConvos.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: 'var(--space-lg) 0' }}>
            No blocked accounts.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {blockedConvos.map((convo) => (
              <div
                key={convo.id}
                style={{
                  padding: 'var(--space-md)',
                  background: 'var(--subtle)',
                  borderRadius: 'var(--radius)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>
                    Blocked Conversation
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                    ID: {convo.id.substring(0, 16)}...
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="small"
                  onClick={() => {
                    handleUnblockConversation(convo.id);
                    if (blockedConvos.length === 1) {
                      setShowBlockedModal(false);
                    }
                  }}
                >
                  Unblock
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Rename Modal */}
      <Modal
        isOpen={renameModalOpen}
        onClose={() => setRenameModalOpen(false)}
        title="Rename Conversation"
        footer={
          <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setRenameModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename}>
              Save
            </Button>
          </div>
        }
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          placeholder="Enter a nickname..."
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleRename();
            }
          }}
        />
      </Modal>
    </AppShell>
  );
}
