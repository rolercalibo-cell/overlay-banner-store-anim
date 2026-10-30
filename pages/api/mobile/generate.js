import { put } from '@vercel/blob';
import { generateImage } from '../../../lib/apitemplate';
import {
  validateText,
  validateCredentialOverride,
  isTrustedBlobUrl,
  MAX_HEADLINE_LENGTH,
  MAX_SECONDARY_LENGTH,
} from '../../../lib/validation';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageUrl, headline, secondaryText, templateId, authCode } = req.body || {};

  if (!isTrustedBlobUrl(imageUrl)) {
    return res.status(400).json({ error: 'Invalid photo reference. Please re-select your photo.' });
  }

  const headlineError = validateText(headline, MAX_HEADLINE_LENGTH, 'Headline');
  if (headlineError) return res.status(400).json({ error: headlineError });

  const secondaryError = validateText(secondaryText, MAX_SECONDARY_LENGTH, 'Secondary text');
  if (secondaryError) return res.status(400).json({ error: secondaryError });

  // Optional per-request override so users can point at a different APITemplate.io account
  const templateIdError = validateCredentialOverride(templateId, 'Template ID');
  if (templateIdError) return res.status(400).json({ error: templateIdError });

  const authCodeError = validateCredentialOverride(authCode, 'Auth code');
  if (authCodeError) return res.status(400).json({ error: authCodeError });

  try {
    const { buffer, contentType, ext } = await generateImage({
      imageUrl,
      headline,
      secondaryText,
      templateId: templateId || undefined,
      authCode: authCode || undefined,
    });

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
    const message = err.message.includes('credentials') || err.message.includes('quota') || err.message.includes('timed out') || err.message.includes('not configured')
      ? err.message
      : 'Image generation failed. Please try again.';
    return res.status(502).json({ error: message });
  }
}
