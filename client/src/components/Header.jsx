/**
 * Application header, shared by every screen in the prototype.
 *
 * The auth screens show the brand alone; the signed-in screens add navigation
 * and account controls to the right of it. `children` is that right-hand slot,
 * so later tickets extend the header instead of reimplementing it.
 */
export default function Header({ children }) {
  return (
    <header
      id="header"
      className="sticky top-0 z-50 flex h-16 w-full items-center justify-between border-b border-border-light bg-white px-6 md:px-12"
    >
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <i className="fa-solid fa-graduation-cap text-lg text-white" aria-hidden="true" />
        </div>
        <span className="text-20 font-semibold text-near-black">Baringa Alumni</span>
      </div>

      {children}
    </header>
  );
}
