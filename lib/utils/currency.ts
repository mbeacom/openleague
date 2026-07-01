/**
 * Format an integer amount of the smallest currency unit (e.g. cents) as a
 * localized currency string. Falls back gracefully for unknown currency codes.
 */
export function formatCurrencyFromCents(amountCents: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency}`;
  }
}
