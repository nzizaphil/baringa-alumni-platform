import HeaderNav from './HeaderNav.jsx';
import NotificationBell from './NotificationBell.jsx';

/**
 * Application header, shared by every screen in the prototype.
 *
 * The auth screens show the brand alone; the signed-in screens add navigation
 * and account controls to the right of it. `children` is that right-hand slot,
 * so later tickets extend the header instead of reimplementing it.
 *
 * The left-hand group carries the brand and the navigation that belongs to the
 * signed-in account. `HeaderNav` renders itself only for an approved account,
 * and adds the administrator entry only for an administrator, which is what
 * produces both prototypes' headers without any screen having to ask for one -
 * see `docs/prototype/06-BaringaAlumni - F07.2 Member F.html` and
 * `12-BaringaAlumni - F17.1 Admin Da.html`.
 *
 * `NotificationBell` sits at the head of the right-hand group for the same
 * reason: it belongs to the account rather than to any one screen
 * (`10-BaringaAlumni - F14.1 Notifica.html`), and it too draws nothing unless
 * the account is approved. It is outside the `children` slot so a screen that
 * replaces that slot cannot accidentally drop it.
 */
export default function Header({ children }) {
  return (
    <header
      id="header"
      className="sticky top-0 z-50 flex h-16 w-full items-center justify-between border-b border-border-light bg-white px-6 md:px-12"
    >
      {/*
        * `min-w-0` is what lets this group be squeezed rather than pushing the
        * account controls off the right edge: without it a flex child refuses
        * to shrink below its content, and at 320px the header overflowed the
        * page by 65px.
        */}
      <div className="flex min-w-0 items-center gap-4 md:gap-8">
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <i className="fa-solid fa-graduation-cap text-lg text-white" aria-hidden="true" />
          </div>
          {/* The wordmark gives way to the mark alone on the narrowest phones,
              where those 120px are the difference between the navigation
              fitting and the header scrolling sideways. */}
          <span className="hidden text-20 font-semibold text-near-black sm:inline">
            Baringa Alumni
          </span>
        </div>

        <HeaderNav />
      </div>

      {/* Never shrinks: sign-out and the unread count are the two things that
          must stay reachable at every width. */}
      <div className="flex shrink-0 items-center gap-2">
        <NotificationBell />
        {children}
      </div>
    </header>
  );
}
