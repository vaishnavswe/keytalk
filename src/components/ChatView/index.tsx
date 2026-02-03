import { useRef, useEffect, useState, KeyboardEvent } from 'react';
import { formatAddress } from '../../lib/utils';
import { Button } from '../Button';
import styles from './ChatView.module.css';

interface Message {
  id: string;
  content: string;
  isSelf: boolean;
  timestamp: Date;
}

interface ChatViewProps {
  conversationId: string;
  peerName: string;
  messages: Message[];
  loading: boolean;
  error?: string;
  onSend: (text: string) => Promise<void>;
  onBack?: () => void;
}

export function ChatView({
  conversationId,
  peerName,
  messages,
  loading,
  error,
  onSend,
  onBack,
}: ChatViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!messageInput.trim() || sending) return;
    const text = messageInput.trim();
    setMessageInput('');
    setSending(true);
    try {
      await onSend(text);
    } catch (e) {
      console.error('Failed to send:', e);
      // Restore input if send failed
      setMessageInput(text);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(conversationId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatMessageTime = (date: Date) => {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getInitial = () => {
    return peerName.charAt(0).toUpperCase();
  };

  if (loading) {
    return (
      <div className={styles.chatView}>
        <div className={styles.header}>
          {onBack && (
            <button className={styles.backBtn} onClick={onBack}>
              ←
            </button>
          )}
          <div className={styles.headerInfo}>
            <div className={styles.headerAvatar}>{getInitial()}</div>
            <div className={styles.headerDetails}>
              <span className={styles.headerName}>{peerName}</span>
              <span className={styles.headerAddress}>Loading...</span>
            </div>
          </div>
        </div>
        <div className={styles.messagesArea}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={`${styles.skeletonMessage} ${i % 2 === 0 ? styles.self : ''}`}
            >
              <div className={styles.skeletonBubble} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.chatView}>
        <div className={styles.header}>
          {onBack && (
            <button className={styles.backBtn} onClick={onBack}>
              ←
            </button>
          )}
          <div className={styles.headerInfo}>
            <div className={styles.headerAvatar}>{getInitial()}</div>
            <div className={styles.headerDetails}>
              <span className={styles.headerName}>{peerName}</span>
            </div>
          </div>
        </div>
        <div className={styles.error}>
          <div className={styles.errorContent}>
            <div className={styles.errorIcon}>⚠️</div>
            <h3 className={styles.errorTitle}>Something went wrong</h3>
            <p className={styles.errorText}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.chatView}>
      {/* Header */}
      <div className={styles.header}>
        {onBack && (
          <button className={styles.backBtn} onClick={onBack}>
            ←
          </button>
        )}
        <div className={styles.headerInfo}>
          <div className={styles.headerAvatar}>{getInitial()}</div>
          <div className={styles.headerDetails}>
            <span className={styles.headerName}>{peerName}</span>
            <span className={styles.headerAddress}>
              {formatAddress(conversationId, 8, 6)}
              <button className={styles.copyBtn} onClick={copyAddress} title="Copy">
                {copied ? '✓' : '📋'}
              </button>
            </span>
          </div>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.statusIndicator}>
            <span className={styles.statusDot} />
            Connected
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className={styles.messagesArea}>
        {messages.length === 0 ? (
          <div className={styles.emptyMessages}>
            <div className={styles.emptyContent}>
              <div className={styles.emptyIcon}>👋</div>
              <h3 className={styles.emptyTitle}>No messages yet</h3>
              <p className={styles.emptyText}>
                Send a message to start the conversation
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`${styles.messageGroup} ${msg.isSelf ? styles.self : styles.other}`}
            >
              <div className={`${styles.message} ${msg.isSelf ? styles.self : styles.other}`}>
                {msg.content}
              </div>
              <span className={styles.messageTime}>{formatMessageTime(msg.timestamp)}</span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div className={styles.composer}>
        <div className={styles.composerInner}>
          <textarea
            className={styles.composerInput}
            placeholder="Type a message..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            rows={1}
          />
          <button
            className={styles.sendButton}
            onClick={handleSend}
            disabled={!messageInput.trim() || sending}
          >
            {sending ? '...' : '→'}
          </button>
        </div>
      </div>
    </div>
  );
}
