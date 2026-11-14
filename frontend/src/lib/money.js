// Format an amount stored in cents, e.g. 5000 -> "$50.00"
export function formatMoney(cents, currency = 'USD') {
  const value = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}
