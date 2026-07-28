// Cache στη μνήμη με TTL και singleflight.
//
// Singleflight σημαίνει: αν 50 χρήστες ζητήσουν ταυτόχρονα την ίδια στάση,
// φεύγει ένα μόνο request προς το OASA και όλοι παίρνουν το ίδιο αποτέλεσμα.

const MAX_ENTRIES = 2000;
const NEGATIVE_TTL_MS = 5000;
export { MAX_ENTRIES, NEGATIVE_TTL_MS };

const entries = new Map(); // key -> { value, expiresAt }
const inFlight = new Map(); // key -> Promise

function deleteExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(key);
  }
}

// Κατά προσέγγιση LRU: η επαναπροσθήκη στο cache στη γραμμή 37 σπρώχνει τα συχνά κλειδιά προς το τέλος, οπότε η Map επιστρέφει πρώτα αυτά που χρησιμοποιήθηκαν λιγότερο.
function evictLRU() {
  if (entries.size < MAX_ENTRIES) return;
  for (const [key] of entries) {
    entries.delete(key);
    if (entries.size < MAX_ENTRIES) break;
  }
}

/**
 * Επιστρέφει την τιμή από το cache ή την παράγει με τη produce().
 * Τα σφάλματα αποθηκεύονται με μικρό TTL (negative cache) ώστε να
 * αποφεύγεται το retry-storm κατά τη διάρκεια outage.
 */
export async function cached(key, ttlMs, produce) {
  const hit = entries.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    if (hit.value?.error) {
      throw hit.value.errorObj;
    }
    entries.delete(key);
    entries.set(key, hit);
    return hit.value;
  }

  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = (async () => {
    try {
      const value = await produce();
      if (entries.size >= MAX_ENTRIES) deleteExpiredEntries();
      evictLRU();
      entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } catch (err) {
      if (entries.size >= MAX_ENTRIES) deleteExpiredEntries();
      evictLRU();
      entries.set(key, { value: { error: true, errorObj: err }, expiresAt: Date.now() + NEGATIVE_TTL_MS });
      throw err;
    }
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, request);
  return request;
}

export function cacheStats() {
  return { entries: entries.size, inFlight: inFlight.size };
}
