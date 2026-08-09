const rateLimit = require('express-rate-limit');

/** Tight limiter for login/register endpoints — mitigates credential stuffing. */
const authLimiter = rateLimit({
  windowMs: (Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MIN) || 15) * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

/** Looser limiter for the anonymous public question box — prevents spam floods. */
const questionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'You have submitted too many questions. Please try again later.' },
});

/** Limiter for donation order-creation/verification — generous enough for a real donor retrying a card, tight enough to block automated abuse. */
const donationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many donation attempts. Please wait a few minutes and try again.' },
});

/** General-purpose API limiter applied globally as a baseline defense. */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { authLimiter, questionLimiter, apiLimiter, donationLimiter };
