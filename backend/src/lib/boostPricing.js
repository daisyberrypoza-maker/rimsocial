// Promotion pricing by the owner's country. Amounts are in each currency's minor unit (kobo, pesewa, cents).
// Starting values from rough exchange rates: review them against current rates before launch.
const PRICING = {
  NGN: { dailyMinMinor: 75000, dailyMaxMinor: 5250000, dailyDefaultMinor: 150000, creditMinor: 3750000 },
  GHS: { dailyMinMinor: 800, dailyMaxMinor: 54200, dailyDefaultMinor: 1600, creditMinor: 39000 },
  KES: { dailyMinMinor: 6500, dailyMaxMinor: 455000, dailyDefaultMinor: 13000, creditMinor: 325000 },
  ZAR: { dailyMinMinor: 900, dailyMaxMinor: 63000, dailyDefaultMinor: 1800, creditMinor: 45000 },
  USD: { dailyMinMinor: 50, dailyMaxMinor: 3500, dailyDefaultMinor: 100, creditMinor: 2500 },
};
const COUNTRY_CURRENCY = { NG: 'NGN', GH: 'GHS', KE: 'KES', ZA: 'ZAR' };

function pricingFor(country) {
  const currency = COUNTRY_CURRENCY[String(country || '').toUpperCase()] || 'USD';
  return { currency, ...PRICING[currency] };
}
function pricingForCurrency(currency) {
  return PRICING[currency] ? { currency, ...PRICING[currency] } : null;
}

// Smallest amount Paystack will take for a card charge (1 unit of the currency's minor unit, rounded up)
const PAYSTACK_MIN_MINOR = 100;

module.exports = { pricingFor, pricingForCurrency, PAYSTACK_MIN_MINOR };
