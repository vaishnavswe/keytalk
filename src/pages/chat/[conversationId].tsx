import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAccount } from "wagmi";
import type { Client, Conversation, DecodedMessage } from "@xmtp/browser-sdk";
import { ConsentState } from "@xmtp/browser-sdk";
import { getXmtpClient } from "../../lib/xmtp/store";
import { AppShell } from "../../components/AppShell";
import { ChatView } from "../../components/ChatView";
import { Button } from "../../components/Button";

// Helper to mark conversation as read
function markAsRead(address: string | undefined, convoId: string) {
  if (typeof window === 'undefined' || !address) return;
  const key = `xmtp_lastread_${address}_${convoId}`;
  localStorage.setItem(key, new Date().toISOString());
}

// Helper to get nickname
function getNickname(address: string | undefined, convoId: string): string | null {
  if (typeof window === 'undefined' || !address) return null;
  const key = `xmtp_nickname_${address}_${convoId}`;
  return localStorage.getItem(key);
}

export default function ChatPage() {
  const router = useRouter();
  const { conversationId } = router.query;
  const { address } = useAccount();

  const [client, setClient] = useState<Client | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<DecodedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<AsyncIterable<DecodedMessage> | null>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Check for XMTP client and load conversation
  useEffect(() => {
    if (!conversationId || typeof conversationId !== "string") return;

    const xmtp = getXmtpClient();
    if (!xmtp) {
      setLoading(false);
      return;
    }

    setClient(xmtp);
    loadConversation(xmtp, conversationId);

    // Cleanup stream on unmount
    return () => {
      // Stream cleanup is handled by the streaming effect
    };
  }, [conversationId]);

  // Stream messages when we have a conversation
  useEffect(() => {
    if (!client || !conversation) return;

    let cancelled = false;

    async function startStream() {
      try {
        // Stream all messages and filter by conversation
        const stream = await client!.conversations.streamAllMessages();
        streamRef.current = stream;

        for await (const message of stream) {
          if (cancelled) break;

          // Only add messages for this conversation
          if (message.conversationId === conversation!.id) {
            setMessages((prev) => {
              // Avoid duplicates
              if (prev.some((m) => m.id === message.id)) {
                return prev;
              }
              return [...prev, message];
            });
            // Mark as read since user is viewing the chat
            markAsRead(address, conversation!.id);
          }
        }
      } catch (e) {
        if (!cancelled) {
          console.error("Stream error:", e);
        }
      }
    }

    startStream();

    return () => {
      cancelled = true;
    };
  }, [client, conversation, address]);

  async function loadConversation(xmtp: Client, convoId: string) {
    try {
      setLoading(true);
      setError("");

      // Sync conversations first
      await xmtp.conversations.sync();

      // Get conversation by ID
      const convo = await xmtp.conversations.getConversationById(convoId);

      if (!convo) {
        setError("Conversation not found");
        setLoading(false);
        return;
      }

      // Check consent state and handle denied conversations
      const consentState = await convo.consentState();
      if (consentState === ConsentState.Denied) {
        // If user is accessing a denied conversation directly, assume they want to re-enable it
        await convo.updateConsentState(ConsentState.Unknown);
      }

      setConversation(convo);

      // Mark conversation as read when opening
      markAsRead(address, convoId);

      // Sync messages for this conversation
      await convo.sync();

      // Load latest messages
      const msgs = await convo.messages({ limit: 50n });
      setMessages(msgs);
    } catch (e) {
      console.error("Failed to load conversation:", e);
      setError(e instanceof Error ? e.message : "Failed to load conversation");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendMessage(text: string) {
    if (!conversation || !text.trim() || !client) return;

    try {
      const messageText = text.trim();
      
      // Check if this is the first message being sent in this conversation
      const currentConsentState = await conversation.consentState();
      
      // Send the message
      await conversation.sendText(messageText);
      console.log("Message sent:", messageText);
      
      // If the conversation consent was Unknown or Denied (re-started conversation), 
      // set it to Allowed so it appears in the sender's inbox
      if (currentConsentState === ConsentState.Unknown || currentConsentState === ConsentState.Denied) {
        await conversation.updateConsentState(ConsentState.Allowed);
        console.log("Updated consent state to Allowed");
      }
      
      // Force sync and reload to ensure UI updates immediately
      await conversation.sync();
      const updatedMessages = await conversation.messages({ limit: 50n });
      setMessages(updatedMessages);
      console.log("Messages reloaded after send:", updatedMessages.length);
    } catch (e) {
      console.error("Failed to send message:", e);
      throw e; // Re-throw so ChatView can handle it
    }
  }

  // If no XMTP client, show message
  if (!client && !loading) {
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
          <p style={{ color: 'var(--danger)' }}>
            XMTP client not found. Please go back to home and create one.
          </p>
          <Link href="/">
            <Button variant="primary">Back to Home</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  // Get peer address or ID for display
  const convoIdStr = typeof conversationId === 'string' ? conversationId : '';
  const nickname = address ? getNickname(address, convoIdStr) : null;
  const displayName = nickname || `User ${convoIdStr.substring(0, 8)}...`;

  // Transform messages for ChatView
  const chatMessages = messages
    .filter((m) => typeof m.content === 'string')
    .map((msg) => ({
      id: msg.id,
      content: msg.content as string,
      isSelf: msg.senderInboxId === client?.inboxId,
      timestamp: new Date(Number(msg.sentAtNs) / 1_000_000),
    }));

  return (
    <AppShell>
      <ChatView
        conversationId={convoIdStr}
        peerName={displayName}
        messages={chatMessages}
        loading={loading}
        error={error}
        onSend={handleSendMessage}
        onBack={() => router.push('/inbox')}
      />
    </AppShell>
  );
}
