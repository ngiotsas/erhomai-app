// Cache στη μνήμη με TTL και singleflight.
//
// Singleflight σημαίνει: αν 50 χρήστες ζητήσουν ταυτόχρονα την ίδια στάση,
// φεύγει ένα μόνο request προς το OASA και όλοι παίρνουν το ίδιο αποτέλεσμα.

const MAX_ENTRIES = 2000;

const entries = new Map(); // key -> { value, expiresAt }
const inFlight = new Map(); // key -> Promise

function deleteExpiredEntries() {
  const now = Date.now();
  const expiredKeys = [];
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) expiredKeys.push(key);
  }
  for (const key of expiredKeys) entries.delete(key);
}

/**
 * Επιστρέφει την τιμή από το cache ή την παράγει με τη produce().
 * Τα σφάλματα δεν μπαίνουν ποτέ στο cache, ώστε η επόμενη προσπάθεια
 * να ξαναχτυπήσει το OASA.
 */
export async function cached(key, ttlMs, produce) {
  const hit = entries.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const value = await produce();
    if (entries.size >= MAX_ENTRIES) deleteExpiredEntries();
    entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, request);
  return request;
}

export function cacheStats() {
  return { entries: entries.size, inFlight: inFlight.size };
}
