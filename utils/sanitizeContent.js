const sanitizeHtml = require('sanitize-html');

/**
 * Strips dangerous tags/attributes from rich-text post content while still
 * allowing the formatting editors need (headings, lists, images, embeds).
 * This is the single choke point that prevents stored XSS in posts,
 * announcements, and question answers.
 */
function sanitizeRichText(dirty = '') {
  return sanitizeHtml(dirty, {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'p', 'br', 'hr', 'blockquote', 'strong', 'em', 'u', 's',
      'ul', 'ol', 'li', 'a', 'img', 'video', 'source', 'code', 'pre', 'figure', 'figcaption',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      video: ['src', 'controls', 'width', 'height'],
      source: ['src', 'type'],
    },
    allowedSchemes: ['http', 'https', 'data'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
    },
  });
}

/** Plain-text-only sanitizer for fields like titles, tags, question text. */
function sanitizePlainText(dirty = '') {
  return sanitizeHtml(dirty, { allowedTags: [], allowedAttributes: {} }).trim();
}

module.exports = { sanitizeRichText, sanitizePlainText };
