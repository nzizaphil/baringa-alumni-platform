import HeaderNav from './HeaderNav.jsx';

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
 */
export default function Header({ children }) {
  return (
    <header
      id="header"
      className="sticky top-0 z-50 flex h-16 w-full items-center justify-between border-b border-border-light bg-white px-6 md:px-12"
    >
      <div className="flex items-center gap-4 md:gap-8">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <i className="fa-solid fa-graduation-cap text-lg text-white" aria-hidden="true" />
          </div>
          <span className="text-20 font-semibold text-near-black">Baringa Alumni</span>
        </div>

        <HeaderNav />
      </div>

      {children}
    </header>
  );
}
