import { useContext } from 'react';

import AuthContext from '../context/authContext.js';

/**
 * Reads the current session.
 *
 * @returns {import('../context/authContext.js').AuthValue}
 * @throws {Error} When called from outside `AuthProvider`, which is a wiring
 *   mistake rather than a state the UI should try to render around.
 */
export default function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }

  return value;
}
