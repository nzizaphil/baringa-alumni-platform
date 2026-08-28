import mongoose from 'mongoose';

/**
 * How widely a post is shown (`POST-1`).
 *
 * `members_only` is the default and the only value this phase acts on: the feed
 * is behind `requireApproved`, so everything it returns is already members-only
 * in effect. `public` is persisted so the field exists when the ticket that
 * introduces a public view lands, and so posts written before that ticket carry
 * a meaningful value rather than needing a migration to acquire one.
 */
export const POST_VISIBILITIES = ['public', 'members_only'];

/**
 * The longest a post may be, in characters, after trimming.
 *
 * Exported so the validator and the schema cannot drift: the schema is the last
 * line of defence and the validator is what turns an over-long body into a
 * field-level 422 rather than a 500.
 */
export const MAX_POST_LENGTH = 2000;

/**
 * A professional update written by an approved member.
 *
 * `hidden` is the moderation flag. Nothing in this phase sets it - hiding,
 * reporting and reactions are Phase 2 - but every feed query filters on it from
 * the outset, so a post hidden by hand in the database or by a later ticket
 * disappears from the feed without the query having to change.
 */
const postSchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A post must have an author'],
      // Indexed on its own: "everything this member wrote" is not a prefix of
      // the feed index below, and it is the query a profile screen will make.
      index: true,
    },
    body: {
      type: String,
      required: [true, 'Post body is required'],
      trim: true,
      maxlength: [MAX_POST_LENGTH, `Post body must be ${MAX_POST_LENGTH} characters or fewer`],
    },
    visibility: {
      type: String,
      enum: POST_VISIBILITIES,
      default: 'members_only',
    },
    hidden: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

/**
 * The feed query: visible posts, newest first.
 *
 * `hidden` is the prefix, so this indexes it on its own as well - a separate
 * single-field index on `hidden` would be redundant with this one, and a
 * two-valued field is poor material for an index by itself in any case. The
 * sort is served straight from the index rather than in memory.
 */
postSchema.index({ hidden: 1, createdAt: -1 });

const Post = mongoose.model('Post', postSchema);

export default Post;
