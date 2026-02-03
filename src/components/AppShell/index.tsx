import { ReactNode, useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import styles from './AppShell.module.css';

interface AppShellProps {
  sidebar?: ReactNode;
  children: ReactNode;
  showBackButton?: boolean;
  onBack?: () => void;
  mobileTitle?: string;
}

export function AppShell({ 
  sidebar, 
  children, 
  showBackButton = false,
  onBack,
  mobileTitle 
}: AppShellProps) {
  const { theme, toggleTheme, mounted } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = () => setSidebarOpen(false);

  // If no sidebar, render just the content in a simple layout
  if (!sidebar) {
    return (
      <div className={styles.layout}>
        <div className={`${styles.main} ${styles.noSidebar}`}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      {/* Mobile overlay */}
      <div 
        className={`${styles.mobileOverlay} ${sidebarOpen ? styles.visible : ''}`}
        onClick={closeSidebar}
      />

      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.logo}>
            <img src="/logo.png" alt="KeyTalk" className={styles.logoIcon} />
            <span className={styles.logoText}>KeyTalk</span>
          </div>
          <div className={styles.headerActions}>
            {mounted && (
              <button 
                className={styles.themeToggle}
                onClick={toggleTheme}
                title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              >
                {theme === 'light' ? '🌙' : '☀️'}
              </button>
            )}
          </div>
        </div>
        <div className={styles.sidebarContent}>
          {sidebar}
        </div>
      </aside>

      {/* Main content */}
      <main className={styles.main}>
        {/* Mobile header */}
        <div className={styles.mobileHeader}>
          {showBackButton && onBack ? (
            <button className={styles.backButton} onClick={onBack}>
              ← Back
            </button>
          ) : (
            <button className={styles.hamburger} onClick={() => setSidebarOpen(true)}>
              ☰
            </button>
          )}
          <span className={styles.logoText}>{mobileTitle || 'KeyTalk'}</span>
          <div style={{ width: 40 }} /> {/* Spacer for centering */}
        </div>
        {children}
      </main>
    </div>
  );
}

// Empty state component
export function EmptyState({ 
  icon, 
  title, 
  description 
}: { 
  icon: string; 
  title: string; 
  description: string;
}) {
  return (
    <div className={styles.mainEmpty}>
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>{icon}</div>
        <h2 className={styles.emptyTitle}>{title}</h2>
        <p className={styles.emptyText}>{description}</p>
      </div>
    </div>
  );
}
