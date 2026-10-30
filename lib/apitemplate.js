// Server-only helper for the APITemplate.io Direct URL integration.
// Credentials never leave this module — callers only get back an image buffer.

const DIRECT_URL_HOST = 'rest.apitemplate.io';
const MAX_RESPONSE_BYTES = 15 * 1024 * 1024; // 15MB safety cap on the generated image

/**
 * Builds the Direct URL for the configured template, overriding only the
 * three dynamic properties the app exposes (background image, headline, secondary text).
 * Throws if the required env vars are missing so callers fail fast with a clear message.
 *
 * Format is account-specific — confirmed against the template's own Direct URL tab:
 *   https://rest.apitemplate.io/{template_id}@{auth_code}/image.png?{element.property}=value
 * (the generic /v2/create-image-url/{id}?auth= path returns HTTP 404 for this account).
 */
export function buildDirectUrl({ imageUrl, headline, secondaryText }) {
  const templateId = process.env.APITEMPLATE_TEMPLATE_ID;
  const authCode = process.env.APITEMPLATE_AUTH_CODE;

  if (!templateId || !authCode) {
    throw new Error('APITemplate.io is not configured (missing APITEMPLATE_TEMPLATE_ID or APITEMPLATE_AUTH_CODE)');
  }

  const url = new URL(
    `https://${DIRECT_URL_HOST}/${encodeURIComponent(templateId)}@${encodeURIComponent(authCode)}/image.png`
  );
  const params = new URLSearchParams();
  params.set('rect_image_bg.src', imageUrl);
  params.set('text_name.text', headline);
  params.set('text_name_1.text', secondaryText);
  url.search = params.toString();

  return url.toString();
}


/**
 * Calls the Direct URL server-side and returns the generated image as a Buffer.
 * The auth code is only ever used in this outgoing request, never returned to the caller.
 */
export async function generateImage({ imageUrl, headline, secondaryText }) {
  const directUrl = buildDirectUrl({ imageUrl, headline, secondaryText });

  let response;
  try {
    response = await fetch(directUrl, { signal: AbortSignal.timeout(25000) });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new Error('APITemplate.io request timed out');
    }
    throw new Error('Failed to reach APITemplate.io');
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error('APITemplate.io rejected the request (invalid credentials)');
  }
  if (response.status === 429) {
    throw new Error('APITemplate.io rate limit or quota exceeded');
  }
  if (!response.ok) {
    throw new Error(`APITemplate.io returned HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new Error('APITemplate.io did not return a valid image');
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_RESPONSE_BYTES) {
    throw new Error('Generated image exceeds the allowed size');
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error('Generated image exceeds the allowed size');
  }

  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  return { buffer, contentType, ext };
}
