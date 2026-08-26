import Footer from './Footer.jsx';
import Header from './Header.jsx';

/**
 * The header / main / footer frame every prototype screen sits inside.
 *
 * `main` grows to fill the viewport so the footer stays at the bottom on short
 * pages, matching the prototype's `min-h-screen flex flex-col` body.
 */
export default function PageLayout({ children, headerSlot }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header>{headerSlot}</Header>

      <main className="flex flex-grow items-center justify-center bg-bg-page p-6">
        {children}
      </main>

      <Footer />
    </div>
  );
}
