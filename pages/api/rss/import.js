import { readIndex, writeIndex, storeImage } from '../../../lib/rssStore';
import { parseJsonBody } from '../../../lib/parseBody';

export const config = { api: { bodyParser: false } };

function isAuthorized(req) {
  const secret = process.env.RSS_STORE_SECRET;
  if (!secret) return true;
  const provided = req.headers['x-api-key'] || req.query.secret;
  return provided === secret;
}

const sanitizeSource = (s) =>
  String(s || '').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase().slice(0, 64);

/**
 * POST /api/rss/import
 *
 * Imports items previously produced by GET /api/rss/export, optionally
 * re-categorizing them along the way. Requires x-api-key when RSS_STORE_SECRET is set.
 *
 * Body:
 * {
 *   "items": [ ...exported item objects... ],  // or export payload itself: { items: [...] }
 *   "source": "new-category",                  // optional — force every imported item into this category
 *   "sourceMap": { "old-category": "new-name" },// optional — rename categories during import
 *   "reuploadImages": false,                    // optional — re-host each image blob under the new category
 *                                                //   instead of reusing the exported imageUrl as-is
 *   "mode": "merge"                             // "merge" (default, upsert by id) | "skip-existing" | "new-ids"
 * }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized. Provide x-api-key header.' });
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (err) {
    return res.status(400).json({ error: 'Could not parse request body as JSON', details: err.message });
  }

  const inputItems = Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : null;
  if (!inputItems || inputItems.length === 0) {
    return res.status(400).json({ error: 'Body must contain a non-empty "items" array (as produced by GET /api/rss/export).' });
  }

  const {
    source: forcedSource,
    sourceMap,
    reuploadImages = false,
    mode = 'merge',
  } = Array.isArray(body) ? {} : body;

  if (!['merge', 'skip-existing', 'new-ids'].includes(mode)) {
    return res.status(400).json({ error: 'mode must be "merge", "skip-existing", or "new-ids"' });
  }

  let existing;
  try {
    existing = await readIndex();
  } catch (err) {
    console.error('rss/import readIndex error:', err);
    return res.status(502).json({ error: 'Failed to read RSS store', details: err.message });
  }
  const existingById = new Map(existing.map((i) => [i.id, i]));

  const resolveSource = (item) => {
    if (forcedSource) return sanitizeSource(forcedSource);
    const raw = item.source || 'default';
    const mapped = sourceMap && sourceMap[raw] ? sourceMap[raw] : raw;
    return sanitizeSource(mapped);
  };

  const imported = [];
  const skipped = [];

  for (const [i, raw] of inputItems.entries()) {
    if (!raw || typeof raw !== 'object' || !raw.title) {
      skipped.push({ index: i, reason: 'missing title' });
      continue;
    }

    const id = mode === 'new-ids' ? crypto.randomUUID() : (raw.id || crypto.randomUUID());

    if (mode === 'skip-existing' && existingById.has(id)) {
      skipped.push({ index: i, id, reason: 'already exists' });
      continue;
    }

    const source = resolveSource(raw);

    let imageUrl = raw.imageUrl || raw.originalImageUrl || null;
    if (reuploadImages) {
      const sourceForUpload = raw.originalImageUrl || raw.imageUrl;
      if (sourceForUpload) {
        const uploaded = await storeImage(sourceForUpload, source, id);
        if (uploaded) imageUrl = uploaded;
      }
    }

    const item = {
      id,
      source,
      title: String(raw.title).trim().slice(0, 1000),
      description: String(raw.description || '').trim().slice(0, 20000),
      imageUrl,
      originalImageUrl: raw.originalImageUrl ?? null,
      storedAt: raw.storedAt || new Date().toISOString(),
      used: !!raw.used,
      usedAt: raw.used ? (raw.usedAt || new Date().toISOString()) : null,
    };

    existingById.set(id, item);
    imported.push(item);
  }

  if (imported.length === 0) {
    return res.status(200).json({ success: true, imported: 0, skipped: skipped.length, skippedDetails: skipped });
  }

  const nextIndex = [...existingById.values()];
  try {
    await writeIndex(nextIndex);
  } catch (err) {
    console.error('rss/import writeIndex error:', err);
    return res.status(502).json({ error: 'Failed to update RSS store', details: err.message });
  }

  return res.status(201).json({
    success: true,
    imported: imported.length,
    skipped: skipped.length,
    skippedDetails: skipped,
    total: nextIndex.length,
  });
}
