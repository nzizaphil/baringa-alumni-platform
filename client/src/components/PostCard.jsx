import { USER_ROLE } from '../api/auth.js';
import {
  avatarTint,
  capitalise,
  formatDate,
  formatRelativeTime,
  initialsOf,
} from '../format/registration.js';

/**
 * One post in the feed (`POST-2`), following
 * `docs/prototype/06-BaringaAlumni - F07.2 Member F.html`.
 *
 * The prototype draws an uploaded avatar photograph beside each post. There is
 * no avatar in the data model and no upload in this phase, so the initials disc
 * the registration queue already uses stands in - tinted from the author's id,
 * so the same person is the same colour every time rather than shifting as the
 * feed reorders around them.
 */

/**
 * Role badges, from the prototypes: a member's is
 * `bg-accent text-near-black` (F07.2's header) and an administrator's is
 * `bg-primary text-white` (F17.1's).
 *
 * Moderator is drawn nowhere, so it takes the remaining semantic token in the
 * set - warning - which reads as "has authority here, but not the most" and is
 * distinguishable from both. Replace it if a prototype ever settles the
 * question.
 */
const ROLE_BADGES = {
  [USER_ROLE.MEMBER]: { label: 'Member', classes: 'bg-accent text-near-black' },
  [USER_ROLE.MODERATOR]: { label: 'Moderator', classes: 'bg-warning text-near-black' },
  [USER_ROLE.ADMINISTRATOR]: { label: 'Administrator', classes: 'bg-primary text-white' },
};

/** The author of a post whose account has since been removed. */
const DELETED_AUTHOR = { id: '', name: 'Former member', role: null };

export default function PostCard({ post }) {
  /*
   * The API returns `author: null` when the account behind a post is gone. The
   * post is still shown - a feed with holes in it is worse than one that says
   * who is missing - so the placeholder carries a name and no badge.
   */
  const author = post.author ?? DELETED_AUTHOR;
  const badge = ROLE_BADGES[author.role] ?? null;

  return (
    <article className="rounded-card border border-border-light bg-white p-5 shadow-sm md:p-6">
      <header className="mb-4 flex items-start gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-14 font-semibold ${avatarTint(author.id)}`}
          aria-hidden="true"
        >
          {initialsOf(author.name)}
        </div>

        <div className="min-w-0 flex-grow">
          {/*
           * Name and badge wrap onto a second line rather than truncating on a
           * narrow screen: a post attributed to "Beatrice Nyirahabim…" with the
           * role cut off is worse than one that takes two lines.
           */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-16 font-semibold leading-tight text-near-black">
              {author.name}
            </h3>

            {badge && (
              <span
                className={`rounded-full px-2 py-0.5 text-12 font-semibold ${badge.classes}`}
              >
                {badge.label}
              </span>
            )}
          </div>

          {/*
           * The relative time is what a reader actually wants from a feed; the
           * date it resolves to is one hover - or one screen-reader stop - away
           * rather than taking a line of its own.
           */}
          <time
            className="mt-0.5 block text-12 text-secondary-text"
            dateTime={post.createdAt}
            title={formatDate(post.createdAt)}
          >
            {capitalise(formatRelativeTime(post.createdAt))}
          </time>
        </div>
      </header>

      {/*
       * `whitespace-pre-wrap` keeps the member's own line breaks and runs of
       * spaces, which is the difference between a paragraph and the list they
       * actually typed. `break-words` stops an unbroken 2000-character string
       * from widening the card past the viewport.
       *
       * The body is a React text child, never `dangerouslySetInnerHTML`: React
       * escapes it, so a post whose text is `<img src=x onerror=alert(1)>` is
       * displayed as those characters and cannot become markup. This is the
       * only place a post body is rendered, so that guarantee holds for the
       * whole feed.
       */}
      <p className="whitespace-pre-wrap break-words text-16 text-near-black">{post.body}</p>
    </article>
  );
}
