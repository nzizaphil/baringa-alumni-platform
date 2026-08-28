/**
 * Paths the app navigates to by name.
 *
 * A leaf module on purpose: it imports nothing, so a component that only needs
 * to know *where* something lives does not have to import the component that
 * guards it. `HeaderNav` sits in the header, the header sits inside
 * `PageLayout`, and `PageLayout` is what `AdminRoute` and `RequireAuth` render -
 * so a link reaching for either guard's constants would close an import cycle
 * around the whole layout.
 */

/** Where an approved member belongs: the feed (F07.2). */
export const MEMBER_HOME_PATH = '/feed';

/** Where an account that may not act yet is held (F06.1). */
export const PENDING_PATH = '/pending';

/** The administrator area's home: the pending-registration queue (F17). */
export const ADMIN_HOME_PATH = '/admin';

/** One registration's review panel (F18). */
export function adminReviewPath(id) {
  return `/admin/registrations/${id}`;
}
