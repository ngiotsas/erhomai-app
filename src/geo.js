// Γεωγραφικοί υπολογισμοί. Καμία εξάρτηση, μόνο μαθηματικά.

const EARTH_RADIUS_METERS = 6371008.8;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Απόσταση σε μέτρα μεταξύ δύο σημείων (haversine).
 * Το OASA επιστρέφει ένα πεδίο "distance" χωρίς τεκμηριωμένη μονάδα,
 * οπότε υπολογίζουμε εμείς την απόσταση από τις συντεταγμένες.
 */
export function distanceInMeters(lat1, lng1, lat2, lng2) {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function isValidLatitude(value) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}
