import { readIndex } from '../../../lib/rssStore';

// Split "a,b,c" or repeated params into a deduped, lowercased array of trimmed values
function parseList(value) {
  if (value == null) return [];
  const arr = Array.isArray(value) ? value : String(value).split(',');
  return [...new Set(arr.map((s) => String(s).trim().toLowerCase()).filter(Boolean))];
}

// Parse an ISO/date string into an epoch ms; returns null on failure
function parseDate(value) {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/**
 * GET /api/rss/export
 *
 * Exports RSS store items as a portable JSON document, filterable by category (source).
 * Pair with POST /api/rss/import to move/back up items across categories or deployments.
 *
 * Query parameters (all optional — omit all to export everything):
 *   source/sources  — one category, or comma-separated list of categories to export
 *   used            — "true" → only used; "false" → only unused
 *   from,to         — inclusive storedAt date range (ISO or YYYY-MM-DD)
 *   usedFrom,usedTo — inclusive usedAt date range
 *   download        — "true" → set Content-Disposition so browsers save it as a file
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  const { source, sources, used, from, to, usedFrom, usedTo, download } = req.query;

  let items;
  try {
    items = await readIndex();
  } catch (err) {
    console.error('rss/export readIndex error:', err);
    return res.status(502).json({ error: 'Failed to read RSS store', details: err.message });
  }

  const sourceList = parseList(sources ?? source);
  if (sourceList.length > 0) {
    const set = new Set(sourceList);
    items = items.filter((item) => set.has(String(item.source || '').toLowerCase()));
  }

  if (used === 'true')  items = items.filter((i) => !!i.used);
  if (used === 'false') items = items.filter((i) => !i.used);

  const fromMs = parseDate(from);
  const toRaw  = to && /^\d{4}-\d{2}-\d{2}$/.test(String(to)) ? `${to}T23:59:59.999Z` : to;
  const toMs   = parseDate(toRaw);
  if (fromMs != null) items = items.filter((i) => Date.parse(i.storedAt) >= fromMs);
  if (toMs   != null) items = items.filter((i) => Date.parse(i.storedAt) <= toMs);

  const usedFromMs = parseDate(usedFrom);
  const usedToRaw  = usedTo && /^\d{4}-\d{2}-\d{2}$/.test(String(usedTo)) ? `${usedTo}T23:59:59.999Z` : usedTo;
  const usedToMs   = parseDate(usedToRaw);
  if (usedFromMs != null) items = items.filter((i) => i.usedAt && Date.parse(i.usedAt) >= usedFromMs);
  if (usedToMs   != null) items = items.filter((i) => i.usedAt && Date.parse(i.usedAt) <= usedToMs);

  const categories = sourceList.length > 0 ? sourceList : [...new Set(items.map((i) => i.source))].sort();

  if (download === 'true') {
    const label = sourceList.length > 0 ? sourceList.join('_') : 'all';
    res.setHeader('Content-Disposition', `attachment; filename="rss-export-${label}-${Date.now()}.json"`);
  }

  return res.status(200).json({
    exportedAt: new Date().toISOString(),
    categories,
    count: items.length,
    items,
  });
}
