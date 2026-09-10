import { useState } from 'react';
import { CandlestickChart, ChartNoAxesCombined } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { currency, currencyCode, number, time } from '../lib/api.js';

export function aggregateCandles(points, interval = 5) {
  const groups = new Map();
  for (const p of points) {
    const tick = Math.floor(p.tick / interval) * interval;
    let c = groups.get(tick);
    if (!c) {
      c = { tick, open: p.price, high: p.price, low: p.price, close: p.price, volume: 0 };
      groups.set(tick, c);
    }
    c.high = Math.max(c.high, p.price);
    c.low = Math.min(c.low, p.price);
    c.close = p.price;
    c.volume += p.volume;
  }
  return [...groups.values()].map((c) => ({
    ...c,
    range: [c.low, Math.max(c.high, c.low + 0.001)],
  }));
}
function Candle({ x, y, width, height, payload }) {
  if (!payload || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const color = payload.close >= payload.open ? '#16826a' : '#d44d5e';
  const scale = height / Math.max(0.001, payload.high - payload.low);
  const bodyY = y + (payload.high - Math.max(payload.open, payload.close)) * scale;
  return (
    <g className="price-candle">
      <line
        x1={x + width / 2}
        x2={x + width / 2}
        y1={y}
        y2={y + Math.max(1, height)}
        stroke={color}
      />
      <rect
        x={x}
        y={bodyY}
        width={Math.max(1, width)}
        height={Math.max(1, Math.abs(payload.close - payload.open) * scale)}
        fill={color}
        rx={1}
      />
    </g>
  );
}
function CandleTooltip({ active, payload }) {
  const c = payload?.[0]?.payload;
  return active && c ? (
    <div className="chart-tooltip">
      <strong>{time(c.tick)}</strong>
      <dl>
        {[
          ['Open', c.open],
          ['High', c.high],
          ['Low', c.low],
          ['Close', c.close],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{currency(value)}</dd>
          </div>
        ))}
        <div>
          <dt>Volume</dt>
          <dd>{number(c.volume)}</dd>
        </div>
      </dl>
    </div>
  ) : null;
}
export default function Candles({ market }) {
  const [range, setRange] = useState('1D'),
    [mode, setMode] = useState('candles');
  const count = range === '1H' ? 60 : range === '1D' ? 390 : 2340;
  const interval = range === 'ALL' ? 30 : 5;
  const candles = aggregateCandles(market.history.slice(-count), interval);
  return (
    <section className="chart-section" aria-label={market.symbol + ' price chart'}>
      <div className="section-heading">
        <h2>Price history</h2>
        <div className="chart-controls">
          <div className="segmented compact">
            {[
              ['candles', CandlestickChart],
              ['line', ChartNoAxesCombined],
            ].map(([id, Icon]) => (
              <button
                key={id}
                className={mode === id ? 'selected' : ''}
                aria-label={id === 'candles' ? 'Candlestick chart' : 'Line chart'}
                title={id === 'candles' ? 'Candlestick chart' : 'Line chart'}
                aria-pressed={mode === id}
                onClick={() => setMode(id)}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
          <div className="segmented compact" aria-label="Chart range">
            {['1H', '1D', 'ALL'].map((r) => (
              <button
                key={r}
                className={range === r ? 'selected' : ''}
                aria-pressed={range === r}
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="price-chart">
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 600, height: 280 }}
        >
          <ComposedChart
            data={candles}
            margin={{ top: 12, right: 4, bottom: 0, left: 0 }}
            barCategoryGap="25%"
            barGap="-100%"
          >
            <CartesianGrid vertical={false} stroke="#e5ece9" strokeDasharray="3 4" />
            <XAxis
              dataKey="tick"
              tickFormatter={time}
              minTickGap={65}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#76817e' }}
            />
            <YAxis
              yAxisId="price"
              orientation="right"
              domain={['dataMin - 0.5', 'dataMax + 0.5']}
              width={76}
              tickFormatter={(v) => currency(v, 0)}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: '#76817e' }}
            />
            <YAxis yAxisId="volume" hide domain={[0, (max) => max * 6]} />
            <Tooltip content={<CandleTooltip />} />
            <Bar yAxisId="volume" dataKey="volume" fill="#dce6e1" isAnimationActive={false} />
            {mode === 'candles' ? (
              <Bar yAxisId="price" dataKey="range" shape={<Candle />} isAnimationActive={false} />
            ) : (
              <Line
                yAxisId="price"
                dataKey="close"
                stroke="#16826a"
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-foot">
        <span>
          {currencyCode()} / {interval}-minute OHLC
        </span>
        <span>Simulated prices and volume</span>
      </div>
    </section>
  );
}
