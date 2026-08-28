import { ASSOCIATION_TYPES } from '../api/auth.js';

/**
 * Presentation helpers shared by the two administrator screens.
 *
 * Kept out of both pages because the dashboard table and the review panel must
 * describe the same applicant the same way - an association that reads
 * "Former student / graduate" in one place and "former_student" in the other is
 * two bugs waiting to be reported as one.
 */

/**
 * Human wording for the four association values.
 *
 * The same wording the registration form offers
 * (`ASSOCIATION_OPTIONS` in `pages/RegisterPage.jsx`), so an administrator
 * reads back exactly what the applicant chose.
 */
export const ASSOCIATION_LABELS = {
  [ASSOCIATION_TYPES.CURRENT_STUDENT]: 'Current student',
  [ASSOCIATION_TYPES.FORMER_STUDENT]: 'Former student / graduate',
  [ASSOCIATION_TYPES.CURRENT_LECTURER]: 'Current lecturer',
  [ASSOCIATION_TYPES.FORMER_LECTURER]: 'Former lecturer',
};

/**
 * Label for an association value, falling back to the raw value.
 *
 * A value this build has no label for is shown as it came rather than blanked:
 * an administrator seeing `visiting_fellow` learns something, an empty cell
 * does not.
 */
export function formatAssociation(value) {
  return ASSOCIATION_LABELS[value] ?? value ?? '';
}

/** What a field with nothing in it shows. */
export const NOT_PROVIDED = '—';

/** True when a field carries nothing worth rendering. */
export function isMissing(value) {
  return value === null || value === undefined || value === '';
}

/**
 * `Amina Uwase` -> `AU`. Feeds the avatar circles the prototype draws in the
 * table, which carry no photograph.
 */
export function initialsOf(name) {
  if (!name) return '?';

  const parts = String(name).trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';

  return (first + last).toUpperCase() || '?';
}

/**
 * A stable tint for one applicant's avatar.
 *
 * The prototype alternates three tints down the table. Choosing by a hash of
 * the id rather than by row index keeps an applicant the same colour as the
 * queue shortens around them, so the page does not appear to reshuffle when
 * somebody above them is approved.
 */
const AVATAR_TINTS = [
  'bg-primary bg-opacity-10 text-primary-text',
  'bg-accent bg-opacity-10 text-accent-text',
  'bg-warning bg-opacity-10 text-warning-text',
];

export function avatarTint(id = '') {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash + id.charCodeAt(index)) % AVATAR_TINTS.length;
  }
  return AVATAR_TINTS[hash];
}

/** `Oct 24, 2024`, matching the prototype's absolute dates. */
export function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return NOT_PROVIDED;

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * `2 hours ago`, `yesterday`, `3 weeks ago`.
 *
 * How long somebody has been waiting is the thing an administrator is actually
 * judging when they scan the queue, and a bare date makes them do that
 * arithmetic themselves. Built on `Intl.RelativeTimeFormat`, so no dependency
 * is added for it.
 */
export function formatRelativeTime(value, now = Date.now()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const elapsed = now - date.getTime();
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  // Just-landed registrations: "0 minutes ago" is noise, and a queue is
  // refreshed often enough for this to be a common case.
  if (elapsed < MINUTE) return 'just now';

  if (elapsed < HOUR) return formatter.format(-Math.floor(elapsed / MINUTE), 'minute');
  if (elapsed < DAY) return formatter.format(-Math.floor(elapsed / HOUR), 'hour');
  if (elapsed < WEEK) return formatter.format(-Math.floor(elapsed / DAY), 'day');

  return formatter.format(-Math.floor(elapsed / WEEK), 'week');
}

/** Sentence-cases a relative time for use at the start of a table cell. */
export function capitalise(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}
