import { body } from 'express-validator';

import { ASSOCIATIONS } from '../models/User.js';

// Associations that identify someone by a student number.
const STUDENT_ASSOCIATIONS = ['current_student', 'former_student'];

const MIN_PASSWORD_LENGTH = 8;
const EARLIEST_GRADUATION_YEAR = 1900;

const currentYear = () => new Date().getFullYear();

/**
 * Validation chain for POST /api/auth/register.
 *
 * The controller reads the outcome with `validationResult(req)` and answers
 * 422 with field-level details; nothing here writes a response itself.
 *
 * Sanitisers in these chains mutate `req.body`, so the controller receives a
 * trimmed name, a lower-cased email and a numeric graduation year.
 */
export const registerValidator = [
  body('name')
    .isString()
    .withMessage('Name is required')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .bail()
    .isLength({ max: 120 })
    .withMessage('Name must be 120 characters or fewer'),

  body('email')
    .isString()
    .withMessage('Email is required')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .bail()
    .isEmail()
    .withMessage('Email must be a valid email address')
    .bail()
    // Matches the schema's `lowercase: true` so the duplicate lookup in the
    // controller compares like with like.
    .customSanitizer((value) => value.toLowerCase()),

  body('password')
    .isString()
    .withMessage('Password is required')
    .bail()
    .isLength({ min: MIN_PASSWORD_LENGTH })
    .withMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`)
    .bail()
    .matches(/[A-Za-z]/)
    .withMessage('Password must contain at least one letter')
    .matches(/\d/)
    .withMessage('Password must contain at least one number'),

  body('association')
    .isString()
    .withMessage('Association is required')
    .bail()
    .trim()
    .isIn(ASSOCIATIONS)
    .withMessage(`Association must be one of: ${ASSOCIATIONS.join(', ')}`),

  // Conditional rule: former students must say when they graduated.
  body('graduationYear')
    .if(body('association').equals('former_student'))
    .notEmpty()
    .withMessage('Graduation year is required for former students'),

  // Format rule: applies whenever a graduation year was supplied at all.
  body('graduationYear')
    .optional({ values: 'falsy' })
    .isInt({ min: EARLIEST_GRADUATION_YEAR, max: currentYear() })
    .withMessage(
      `Graduation year must be a four-digit year no later than ${currentYear()}`
    )
    .bail()
    .toInt(),

  // Conditional rule: student numbers identify current and former students.
  body('studentNumber')
    .if(body('association').isIn(STUDENT_ASSOCIATIONS))
    .isString()
    .withMessage('Student number is required for current and former students')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('Student number is required for current and former students'),

  body('studentNumber')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 32 })
    .withMessage('Student number must be 32 characters or fewer'),
];
