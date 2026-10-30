import { put } from '@vercel/blob';
import { generateImage } from '../../../lib/apitemplate';
import { validateText, isTrustedBlobUrl, MAX_HEADLINE_LENGTH, MAX_SECONDARY_LENGTH } from '../../../lib/validation';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageUrl, headline, secondaryText } = req.body || {};

  if (!isTrustedBlobUrl(imageUrl)) {
    return res.status(400).json({ error: 'Invalid photo reference. Please re-select your photo.' });
  }

  const headlineError = validateText(headline, MAX_HEADLINE_LENGTH, 'Headline');
  if (headlineError) return res.status(400).json({ error: headlineError });

  const secondaryError = validateText(secondaryText, MAX_SECONDARY_LENGTH, 'Secondary text');
  if (secondaryError) return res.status(400).json({ error: secondaryError });

  try {
    const { buffer, contentType, ext } = await generateImage({ imageUrl, headline, secondaryText });

    // Re-host the result in our own storage so the client never sees the
    // APITemplate.io auth code that the Direct URL would otherwise expose.
    const filename = `mobile-generated/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const blob = await put(filename, buffer, {
      access: 'public',
      contentType,
      addRandomSuffix: false,
    });

    return res.status(200).json({ imageUrl: blob.url });
  } catch (err) {
    console.error('mobile/generate error:', err.message);
    const message = err.message.includes('credentials') || err.message.includes('quota') || err.message.includes('timed out')
      ? err.message
      : 'Image generation failed. Please try again.';
    return res.status(502).json({ error: message });
  }
}
