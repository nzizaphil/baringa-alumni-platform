import { useContext } from 'react';

import NotificationsContext from '../context/notificationsContext.js';

/**
 * Reads the caller's notifications.
 *
 * @returns {import('../context/notificationsContext.js').NotificationsValue}
 * @throws {Error} When called from outside `NotificationsProvider`, which is a
 *   wiring mistake rather than a state the UI should try to render around.
 */
export default function useNotifications() {
  const value = useContext(NotificationsContext);

  if (!value) {
    throw new Error('useNotifications must be used within a NotificationsProvider.');
  }

  return value;
}
