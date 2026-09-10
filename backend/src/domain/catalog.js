export const SYMBOLS = [
  { symbol: 'AAPL', name: 'Apple', sector: 'Technology', price: 224.5, color: '#68717d' },
  { symbol: 'MSFT', name: 'Microsoft', sector: 'Technology', price: 418.8, color: '#1978c8' },
  { symbol: 'GOOGL', name: 'Alphabet', sector: 'Communication', price: 172.3, color: '#ce4141' },
  { symbol: 'AMZN', name: 'Amazon', sector: 'Consumer', price: 186.7, color: '#ac7b10' },
  { symbol: 'TSLA', name: 'Tesla', sector: 'Automotive', price: 248.2, color: '#bd414c' },
];
export const USERS = Array.from(
  { length: 12 },
  (_, index) => 'Demo Account ' + String(index + 1).padStart(2, '0'),
);
export const INITIAL_CASH = 100000;
export const MINUTES_PER_DAY = 390;
export const LOT_SIZE = 100;
export const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
export const clockLabel = (tick) => {
  const minutes = 570 + (tick % MINUTES_PER_DAY);
  return (
    'Day ' +
    (Math.floor(tick / MINUTES_PER_DAY) + 1) +
    ', ' +
    String(Math.floor(minutes / 60)).padStart(2, '0') +
    ':' +
    String(minutes % 60).padStart(2, '0')
  );
};
