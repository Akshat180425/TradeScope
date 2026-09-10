let csrf = '';
let displayCurrency = 'USD';
let exchangeRate = 83;
export const setSessionToken = (token) => {
  csrf = token || '';
};
export const configureCurrency = (code, rate) => {
  displayCurrency = code || 'USD';
  exchangeRate = rate || 83;
};
export const currencyCode = () => displayCurrency;
export async function api(path, options = {}) {
  const { requestKey, ...fetchOptions } = options;
  const response = await fetch('/api' + path, {
    ...fetchOptions,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
      ...(requestKey ? { 'Idempotency-Key': requestKey } : {}),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/'))
      window.dispatchEvent(new Event('investogram:expired'));
    const error = new Error(data.error || 'The request failed.');
    error.status = response.status;
    throw error;
  }
  return data;
}
export const currency = (value, digits = 2) =>
  new Intl.NumberFormat(displayCurrency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency: displayCurrency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format((value || 0) * (displayCurrency === 'INR' ? exchangeRate : 1));
export const usd = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0);
export const number = (value) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value || 0);
export const percent = (value) => (value >= 0 ? '+' : '') + (value || 0).toFixed(2) + '%';
export const time = (tick) => {
  const m = 570 + (tick % 390);
  return (
    'D' +
    (Math.floor(tick / 390) + 1) +
    ' ' +
    String(Math.floor(m / 60)).padStart(2, '0') +
    ':' +
    String(m % 60).padStart(2, '0')
  );
};
