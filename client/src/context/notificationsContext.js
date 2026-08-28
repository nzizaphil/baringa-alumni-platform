import { createContext } from 'react';

/**
 * The caller's notifications, shared by every screen that shows them.
 *
 * Held in its own module for the same reason `authContext` is: the provider
 * component and the `useNotifications` hook each import it without importing
 * one another, which keeps Vite's fast refresh working on the provider file.
 *
 * One source of truth is what makes the header's unread count agree with the
 * list and with the feed. The feed marks the approval notification read as it
 * displays it; the badge in the header has to follow that down to zero without
 * either component knowing the other exists.
 *
 * @typedef {object} Notification
 * @property {string} id
 * @property {string} type
 * @property {string} message
 * @property {string|null} readAt ISO timestamp, or null while unread.
 * @property {string} createdAt
 *
 * @typedef {object} NotificationsValue
 * @property {Notification[]} notifications Newest first.
 * @property {number} unreadCount
 * @property {'idle'|'loading'|'ready'|'error'} status
 * @property {Error|null} error The failure behind `status: 'error'`.
 * @property {() => void} refresh Refetches the list from the top.
 * @property {(id: string) => Promise<void>} markRead Marks one read.
 * @property {() => Promise<void>} markAllRead Marks every unread one read.
 */

/** @type {import('react').Context<NotificationsValue|null>} */
const NotificationsContext = createContext(null);

export default NotificationsContext;
