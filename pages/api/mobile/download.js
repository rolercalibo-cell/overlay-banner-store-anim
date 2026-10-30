import { isTrustedBlobUrl } from '../../../lib/validation';

// Proxies the generated image back with Content-Disposition so Android/desktop
// browsers reliably download it instead of just navigating to it.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query;
  if (!isTrustedBlobUrl(url)) {
    return res.status(400).json({ error: 'Invalid image reference' });
  }

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) {
      return res.status(502).json({ error: 'Could not retrieve the generated image' });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return res.status(502).json({ error: 'Invalid image response' });
    }

    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const filename = `apps-gadget-${timestamp}.${ext}`;

    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (err) {
    console.error('mobile/download error:', err.message);
    return res.status(500).json({ error: 'Download failed. Please try again.' });
  }
}
