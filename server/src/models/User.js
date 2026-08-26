import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

/**
 * Work factor for bcrypt. Higher is slower to brute-force but slower to log in
 * with; 12 is the platform standard and must not be lowered.
 */
const PASSWORD_SALT_ROUNDS = 12;

export const ROLES = ['member', 'moderator', 'administrator'];
export const STATUSES = ['pending', 'approved', 'rejected'];
export const ASSOCIATIONS = [
  'current_student',
  'former_student',
  'current_lecturer',
  'former_lecturer',
];

/**
 * A registered alumni-platform account.
 *
 * `role` and `status` are deliberately separate: `status` gates whether an
 * account may act at all, `role` gates what it is allowed to do. Registration
 * always produces role `member` / status `pending`; an administrator moves the
 * account on from there.
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    /**
     * Holds the bcrypt digest, never the plaintext: the pre-save hook below
     * replaces whatever is assigned here before the document is written.
     * `select: false` keeps it out of every query result unless a caller
     * explicitly asks for it with `.select('+passwordHash')`.
     */
    passwordHash: {
      type: String,
      required: [true, 'Password is required'],
      select: false,
    },
    role: {
      type: String,
      enum: ROLES,
      default: 'member',
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'pending',
    },
    association: {
      type: String,
      enum: ASSOCIATIONS,
      required: [true, 'Association is required'],
    },
    studentNumber: {
      type: String,
      trim: true,
    },
    graduationYear: {
      type: Number,
    },
    // Set when an administrator approves or rejects the account.
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        // Defence in depth: the digest must never reach a JSON response even
        // if a caller selected it back in.
        delete ret.passwordHash;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

/**
 * Hash the password before it is persisted.
 *
 * Runs whenever `passwordHash` has been assigned - on registration and on any
 * later password change - so the plaintext exists only in memory for the life
 * of the request and is never written or logged.
 */
userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('passwordHash')) {
    return;
  }

  this.passwordHash = await bcrypt.hash(this.passwordHash, PASSWORD_SALT_ROUNDS);
});

/**
 * Compare a candidate plaintext password against the stored digest.
 *
 * Returns false rather than throwing when the digest was not loaded, so
 * callers that forgot `.select('+passwordHash')` fail closed.
 */
userSchema.methods.comparePassword = async function comparePassword(plaintext) {
  if (!this.passwordHash || typeof plaintext !== 'string') {
    return false;
  }

  return bcrypt.compare(plaintext, this.passwordHash);
};

const User = mongoose.model('User', userSchema);

export default User;
