import mongoose from 'mongoose';

/**
 * The kinds of notification the platform can raise.
 *
 * Only membership approval exists in this release (`ADMIN-3`). It is an enum
 * rather than a free string so a typo cannot create a fifth kind of thing the
 * client has never heard of, and so Phase 2 adds a type by adding one entry
 * here and one entry to the copy below - the schema, the routes and the client
 * list do not change.
 */
export const NOTIFICATION_TYPES = {
  MEMBERSHIP_APPROVED: 'MEMBERSHIP_APPROVED',
};

export const NOTIFICATION_TYPE_VALUES = Object.values(NOTIFICATION_TYPES);

/**
 * The default body copy for each type, from
 * `docs/prototype/10-BaringaAlumni - F14.1 Notifica.html`.
 *
 * Only the body lives here. The heading beside it ("Your membership has been
 * approved") and the icon are derived from `type` on the client, so a reworded
 * heading does not require rewriting rows already in the database - and the
 * message that *was* sent stays exactly as it was sent, since it is persisted
 * on the document rather than looked up at read time.
 */
export const NOTIFICATION_MESSAGES = {
  [NOTIFICATION_TYPES.MEMBERSHIP_APPROVED]:
    'You can now post and connect with the community.',
};

/**
 * One notification addressed to one account.
 *
 * Read state is a nullable timestamp rather than a boolean: "when was this
 * read" answers "has this been read" as well, and a boolean could not be
 * widened later without a migration.
 */
const notificationSchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A notification must have a recipient'],
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPE_VALUES,
      required: [true, 'A notification must have a type'],
    },
    message: {
      type: String,
      required: [true, 'A notification must have a message'],
      trim: true,
    },
    /**
     * Null until the recipient reads it. Set explicitly rather than left
     * undefined so "unread" is a value in the document and `{ readAt: null }`
     * matches every unread row, including ones written before a later field is
     * added to this schema.
     */
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

/**
 * The one query this collection serves: a recipient's own notifications,
 * newest first. `recipientId` is the prefix, so this indexes it on its own as
 * well and the list is read straight from the index rather than sorted in
 * memory. A second single-field index on `recipientId` would be redundant with
 * this one.
 */
notificationSchema.index({ recipientId: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
