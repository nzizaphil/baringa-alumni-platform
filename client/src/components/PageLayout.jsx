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
 */
export default function PageLayout({ children, headerSlot }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header>{headerSlot ?? <SignOutButton />}</Header>

      <main className="flex flex-grow items-center justify-center bg-bg-page p-6">
        {children}
      </main>

      <Footer />
    </div>
  );
}
