import { useState, useMemo } from 'react';
import Link from 'next/link';
import { formatAddress, formatTime, truncate } from '../../lib/utils';
import { Button } from '../Button';
import { Input } from '../Input';
import styles from './Sidebar.module.css';

export interface ConversationItem {
  id: string;
  peerAddress?: string;
  nickname?: string;
  unreadCount?: number;
  lastMessage?: string;
  lastMessageTime?: Date;
}

interface SidebarProps {
  conversations: ConversationItem[];
  requests: ConversationItem[];
  blockedCount: number;
  loading: boolean;
  activeTab: 'inbox' | 'requests';
  onTabChange: (tab: 'inbox' | 'requests') => void;
  activeConvoId?: string;
  address?: string;
  inboxId?: string;
  onNewDm: (address: string) => void;
  onAcceptRequest: (id: string) => void;
  onDenyRequest: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, currentName?: string) => void;
  onBlockedClick: () => void;
  onDisconnect: () => void;
}

export function Sidebar({
  conversations,
  requests,
  blockedCount,
  loading,
  activeTab,
  onTabChange,
  activeConvoId,
  address,
  inboxId,
  onNewDm,
  onAcceptRequest,
  onDenyRequest,
  onDeleteConversation,
  onRenameConversation,
  onBlockedClick,
  onDisconnect,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [newDmAddress, setNewDmAddress] = useState('');
  const [showNewDm, setShowNewDm] = useState(false);
  const [copied, setCopied] = useState(false);

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const query = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.nickname?.toLowerCase().includes(query) ||
        c.peerAddress?.toLowerCase().includes(query) ||
        c.id.toLowerCase().includes(query)
    );
  }, [conversations, searchQuery]);

  const getDisplayName = (convo: ConversationItem) => {
    if (convo.nickname) return convo.nickname;
    // Default format: "User [first 8 chars]..."
    const id = convo.peerAddress || convo.id;
    return `User ${id.substring(0, 8)}...`;
  };

  const getInitial = (convo: ConversationItem) => {
    if (convo.nickname) return convo.nickname.charAt(0).toUpperCase();
    return 'U'; // "U" for "User"
  };

  const handleCopyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleNewDmSubmit = () => {
    if (newDmAddress.trim()) {
      onNewDm(newDmAddress.trim());
      setNewDmAddress('');
      setShowNewDm(false);
    }
  };

  return (
    <div className={styles.sidebar}>
      {/* Search */}
      <div className={styles.searchWrapper}>
        <span className={styles.searchIcon}>🔍</span>
        <input
          type="text"
          placeholder="Search conversations..."
          className={styles.searchInput}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* New message button/form */}
      {showNewDm ? (
        <div className={styles.newDmForm}>
          <input
            type="text"
            placeholder="Enter wallet address (0x...)"
            value={newDmAddress}
            onChange={(e) => setNewDmAddress(e.target.value)}
            className={styles.searchInput}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNewDmSubmit();
              if (e.key === 'Escape') {
                setShowNewDm(false);
                setNewDmAddress('');
              }
            }}
          />
          <div style={{ display: 'flex', gap: 'var(--space-xs)', marginTop: 'var(--space-xs)' }}>
            <Button size="small" onClick={handleNewDmSubmit} disabled={!newDmAddress.trim()}>
              Start
            </Button>
            <Button
              variant="ghost"
              size="small"
              onClick={() => {
                setShowNewDm(false);
                setNewDmAddress('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button className={styles.newMessageBtn} onClick={() => setShowNewDm(true)}>
          + New Message
        </Button>
      )}

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'inbox' ? styles.active : ''}`}
          onClick={() => onTabChange('inbox')}
        >
          Inbox ({conversations.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'requests' ? styles.active : ''}`}
          onClick={() => onTabChange('requests')}
        >
          Requests
          {requests.length > 0 && (
            <span className={styles.tabBadge}>{requests.length}</span>
          )}
        </button>
      </div>

      {/* Conversation list */}
      <div className={styles.conversationList}>
        {loading ? (
          // Skeleton loading
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className={styles.skeletonItem}>
                <div className={`${styles.skeleton} ${styles.skeletonAvatar}`} />
                <div className={styles.skeletonText}>
                  <div className={`${styles.skeleton} ${styles.skeletonLine}`} />
                  <div className={`${styles.skeleton} ${styles.skeletonLine}`} />
                </div>
              </div>
            ))}
          </>
        ) : activeTab === 'inbox' ? (
          // Inbox tab
          filteredConversations.length === 0 ? (
            <div className={styles.emptyList}>
              <div className={styles.emptyIcon}>💬</div>
              <p className={styles.emptyText}>
                {searchQuery ? 'No conversations found' : 'No conversations yet'}
              </p>
            </div>
          ) : (
            filteredConversations.map((convo) => (
              <div
                key={convo.id}
                className={`${styles.conversationItem} ${
                  activeConvoId === convo.id ? styles.active : ''
                }`}
              >
                <Link href={`/chat/${convo.id}`} className={styles.conversationLink}>
                  <div className={styles.avatar}>{getInitial(convo)}</div>
                  <div className={styles.conversationContent}>
                    <div className={styles.conversationHeader}>
                      <span className={styles.conversationName}>
                        {getDisplayName(convo)}
                      </span>
                      {convo.lastMessageTime && (
                        <span className={styles.conversationTime}>
                          {formatTime(convo.lastMessageTime)}
                        </span>
                      )}
                    </div>
                    <div className={styles.conversationPreview}>
                      {convo.lastMessage
                        ? truncate(convo.lastMessage, 40)
                        : 'No messages yet'}
                    </div>
                  </div>
                  {(convo.unreadCount ?? 0) > 0 && (
                    <span className={styles.unreadBadge}>{convo.unreadCount}</span>
                  )}
                </Link>
                <div className={styles.conversationActions}>
                  <button
                    className={styles.actionBtn}
                    onClick={(e) => {
                      e.preventDefault();
                      onRenameConversation(convo.id, convo.nickname);
                    }}
                    title="Rename"
                  >
                    ✏️
                  </button>
                  <button
                    className={`${styles.actionBtn} ${styles.deleteBtn}`}
                    onClick={(e) => {
                      e.preventDefault();
                      onDeleteConversation(convo.id);
                    }}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )
        ) : (
          // Requests tab
          <>
            <div style={{ marginBottom: 'var(--space-md)', textAlign: 'right' }}>
              <Button variant="ghost" size="small" onClick={onBlockedClick}>
                Blocked ({blockedCount})
              </Button>
            </div>
            {requests.length === 0 ? (
              <div className={styles.emptyList}>
                <div className={styles.emptyIcon}>✓</div>
                <p className={styles.emptyText}>No pending requests</p>
              </div>
            ) : (
              requests.map((req) => (
                <div key={req.id} className={styles.requestItem}>
                  <div className={styles.requestHeader}>
                    <span className={styles.requestLabel}>New Request</span>
                  </div>
                  <div className={styles.requestId}>
                    {formatAddress(req.peerAddress || req.id, 10, 8)}
                  </div>
                  <div className={styles.requestActions}>
                    <Button
                      variant="success"
                      size="small"
                      onClick={() => onAcceptRequest(req.id)}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="danger"
                      size="small"
                      onClick={() => onDenyRequest(req.id)}
                    >
                      Deny
                    </Button>
                    <Link href={`/chat/${req.id}`}>
                      <Button variant="secondary" size="small">
                        View
                      </Button>
                    </Link>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>

      {/* Footer with user info */}
      <div className={styles.footer}>
        {address && (
          <div className={styles.userInfo}>
            <div className={styles.userAvatar}>
              {address.charAt(2).toUpperCase()}
            </div>
            <div className={styles.userDetails}>
              <div className={styles.userName}>
                User {inboxId ? inboxId.substring(0, 8) : address.substring(0, 10)}...
              </div>
              <div className={styles.userSubtext}>
                Others see you as this
              </div>
            </div>
            <button
              className={styles.copyBtn}
              onClick={handleCopyAddress}
              title="Copy address"
            >
              {copied ? '✓' : '📋'}
            </button>
          </div>
        )}
        <Button variant="ghost" size="small" fullWidth onClick={onDisconnect}>
          Disconnect
        </Button>
      </div>
    </div>
  );
}
