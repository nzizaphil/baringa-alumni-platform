import Footer from './Footer.jsx';
import Header from './Header.jsx';
import SignOutButton from './SignOutButton.jsx';

/**
 * The header / main / footer frame every prototype screen sits inside.
 *
 * `main` grows to fill the viewport so the footer stays at the bottom on short
 * pages, matching the prototype's `min-h-screen flex flex-col` body.
 *
 * With no `headerSlot` given, the header carries the sign-out control, which
 * renders itself only for a signed-in member. That is what produces the
 * prototype's two header variants without every page having to opt in: bare
 * wordmark on the auth screens, wordmark plus "Sign out" once signed in.
 * Passing a `headerSlot` replaces it, so a later ticket can supply the fuller
 * navigation the member screens show.
 *
 * `wide` switches `main` from the centred column the auth and status screens
 * use to the full-width `max-w-7xl` canvas the administrator screens are drawn
 * on (F17, F18). Centring is right for a card somebody reads; it is wrong for a
 * table, which should start at the top of the page and use the width it has.
 *
 * @param {object} props
 * @param {import('react').ReactNode} [props.headerSlot]
 * @param {boolean} [props.wide=false]
 */
export default function PageLayout({ children, headerSlot, wide = false }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header>{headerSlot ?? <SignOutButton />}</Header>

      {wide ? (
        <main className="flex flex-grow flex-col bg-bg-page px-6 py-8 md:px-12">
          <div className="mx-auto flex w-full max-w-7xl flex-grow flex-col">{children}</div>
        </main>
      ) : (
        <main className="flex flex-grow items-center justify-center bg-bg-page p-6">
          {children}
        </main>
      )}

      <Footer />
    </div>
  );
}
