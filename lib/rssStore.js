import { put, list, del } from '@vercel/blob';

// Single JSON blob that acts as the database
const INDEX_PATH = 'rss-data/index.json';

// Resolved public URL of the index blob, cached across warm invocations so
// readIndex() doesn't need to call list() (a billed Advanced Operation) on every request.
let cachedIndexUrl = process.env.RSS_INDEX_BLOB_URL || null;

/**
 * Read all stored RSS items from Vercel Blob.
 * Returns an empty array only when the index has never been created.
 * Throws on any other failure so callers can surface the real error
 * instead of rendering a silently-empty feed.
 */
export async function readIndex() {
  if (!cachedIndexUrl) {
    const { blobs } = await list({ prefix: INDEX_PATH, limit: 1 });
    if (blobs.length === 0) return [];
    cachedIndexUrl = blobs[0].url;
  }

  // Cache-bust so we always get the latest version
  const res = await fetch(`${cachedIndexUrl}?t=${Date.now()}`);
  if (res.status === 404) {
    // Cached URL is stale (index missing/recreated) — force a fresh lookup next time
    cachedIndexUrl = null;
    return [];
  }
  if (!res.ok) {
    throw new Error(`rssStore.readIndex: fetch failed with status ${res.status}`);
  }
  return await res.json();
}

/**
 * Overwrite the JSON index in Vercel Blob.
 */
export async function writeIndex(items) {
  const blob = await put(INDEX_PATH, JSON.stringify(items, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  // Reuse the URL we just got so the next readIndex() skips list() entirely
  cachedIndexUrl = blob.url;
}

/**
 * Fetch a remote image and upload it to Vercel Blob.
 * Accepts either an http(s) URL or a `data:image/...;base64,...` data URL.
 * Returns the stored blob URL, or null on failure.
 * @param {string} imageUrl - original image URL (http/https or data URL)
 * @param {string} source   - feed/source name (used as folder)
 * @param {string} id       - unique item id (used as filename)
 */
export async function storeImage(imageUrl, source, id) {
  try {
    let buffer;
    let contentType;

    if (imageUrl.startsWith('data:')) {
      const match = imageUrl.match(/^data:([^;,]+)(?:;charset=[^;,]+)?(;base64)?,(.*)$/i);
      if (!match) return null;
      contentType = match[1] || 'image/jpeg';
      const isBase64 = !!match[2];
      const payload  = match[3];
      buffer = isBase64
        ? Buffer.from(payload, 'base64')
        : Buffer.from(decodeURIComponent(payload), 'utf-8');
    } else {
      const res = await fetch(imageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSSStoreBot/1.0)' },
      });
      if (!res.ok) return null;
      buffer = Buffer.from(await res.arrayBuffer());
      contentType = res.headers.get('content-type') || 'image/jpeg';
    }

    const ext = contentType.includes('png')  ? 'png'
              : contentType.includes('gif')  ? 'gif'
              : contentType.includes('webp') ? 'webp'
              : 'jpg';

    const blob = await put(`resources/${source}/${id}.${ext}`, buffer, {
      access: 'public',
      contentType,
      addRandomSuffix: false,
      allowOverwrite: false,
    });

    return blob.url;
  } catch (err) {
    console.error('rssStore.storeImage error:', err.message);
    return null;
  }
}

/**
 * Delete a Vercel Blob image by its URL.
 * Silently skips URLs not hosted on Vercel Blob.
 */
export async function deleteImageBlob(imageUrl) {
  try {
    if (imageUrl && imageUrl.includes('blob.vercel-storage.com')) {
      await del(imageUrl);
    }
  } catch (err) {
    console.error('rssStore.deleteImageBlob error:', err.message);
  }
}
