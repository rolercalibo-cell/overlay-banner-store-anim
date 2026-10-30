// Shared server-side validation for the mobile image generator feature.

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_HEADLINE_LENGTH = 120;
export const MAX_SECONDARY_LENGTH = 60;

/** Parses a `data:<mime>;base64,<payload>` string into a Buffer + mime type. */
export function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:([^;,]+);base64,(.*)$/);
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  return { mimeType, buffer };
}

export function validateImageUpload({ mimeType, buffer }) {
  if (!buffer || buffer.byteLength === 0) return 'No photo data received';
  if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) return 'Unsupported image format. Use JPEG, PNG, or WebP.';
  if (buffer.byteLength > MAX_UPLOAD_BYTES) return 'Photo is too large. Maximum size is 10MB.';
  return null;
}

export function validateText(value, maxLength, label) {
  if (typeof value !== 'string' || value.trim().length === 0) return `${label} is required`;
  if (value.length > maxLength) return `${label} must be ${maxLength} characters or fewer`;
  return null;
}

/**
 * Only allow the server to fetch images back from our own Vercel Blob store —
 * blocks SSRF attempts against localhost, private IPs, or arbitrary hosts.
 */
export function isTrustedBlobUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (url.protocol !== 'https:') return false;
    return /\.public\.blob\.vercel-storage\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}
