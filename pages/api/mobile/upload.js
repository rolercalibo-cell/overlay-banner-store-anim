import { put } from '@vercel/blob';
import { parseDataUrl, validateImageUpload } from '../../../lib/validation';

// Base64 JSON payload needs headroom over the 10MB raw-file limit
export const config = {
  api: { bodyParser: { sizeLimit: '14mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('mobile/upload: BLOB_READ_WRITE_TOKEN is not configured');
    return res.status(500).json({ error: 'Photo storage is not configured' });
  }

  try {
    const { imageData } = req.body || {};
    const parsed = parseDataUrl(imageData);
    if (!parsed) {
      return res.status(400).json({ error: 'Invalid photo data' });
    }

    const validationError = validateImageUpload(parsed);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const ext = parsed.mimeType === 'image/png' ? 'png' : parsed.mimeType === 'image/webp' ? 'webp' : 'jpg';
    const filename = `mobile-uploads/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

    const blob = await put(filename, parsed.buffer, {
      access: 'public',
      contentType: parsed.mimeType,
      addRandomSuffix: false,
    });

    return res.status(200).json({ imageUrl: blob.url });
  } catch (err) {
    console.error('mobile/upload error:', err.message);
    return res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
}
