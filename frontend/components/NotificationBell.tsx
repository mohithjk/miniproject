"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Check, Clock3 } from "lucide-react";
import { api } from "@/lib/api";
import type { NotificationItem } from "@/lib/types";

function notificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  const loadNotifications = useCallback(async () => {
    try {
      const items = await api.getNotifications();
      setNotifications(items);
      setError("");
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Could not load notifications.");
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
    const interval = window.setInterval(() => void loadNotifications(), 30000);
    return () => window.clearInterval(interval);
  }, [loadNotifications]);

  async function markAsRead(notification: NotificationItem) {
    if (notification.is_read) return;
    try {
      const updated = await api.markNotificationRead(notification.id);
      setNotifications((current) => current.map((item) => item.id === updated.id ? updated : item));
      setError("");
    } catch (readError: unknown) {
      setError(readError instanceof Error ? readError.message : "Could not mark this notification as read.");
    }
  }

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  return (
    <div className="notification-wrap">
      <button
        aria-expanded={open}
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        className="notification-trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Bell aria-hidden="true" size={17} />
        {unreadCount > 0 && <span className="notification-count">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>
      {open && (
        <section aria-label="Notifications" className="notification-popover">
          <div className="notification-heading">
            <div>
              <p className="eyebrow">Team updates</p>
              <h2>Notifications</h2>
            </div>
            <button aria-label="Refresh notifications" className="notification-refresh" onClick={() => void loadNotifications()} type="button">
              <Clock3 aria-hidden="true" size={15} />
            </button>
          </div>
          {error && <p className="notification-error" role="alert">{error}</p>}
          {notifications.length === 0 && !error ? (
            <p className="notifications-empty">No updates yet. When a teammate unlocks a new branch, you&apos;ll see it here.</p>
          ) : (
            <ul className="notification-list">
              {notifications.map((notification) => (
                <li className={`notification-item${notification.is_read ? " notification-read" : ""}`} key={notification.id}>
                  <span className="notification-bullet" />
                  <div className="notification-copy">
                    <p>{notification.message}</p>
                    <time dateTime={notification.created_at}>{notificationTime(notification.created_at)}</time>
                  </div>
                  {!notification.is_read && (
                    <button
                      aria-label="Mark as read"
                      className="mark-read-button"
                      onClick={() => void markAsRead(notification)}
                      title="Mark as read"
                      type="button"
                    >
                      <Check aria-hidden="true" size={15} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
