import { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { currency, number, time } from '../lib/api.js';
export { default as PriceChart } from './Candles.jsx';
export function LinePriceChart({ market }) {
  const [range, setRange] = useState('1D');
  const count = range === '1H' ? 60 : range === '1D' ? 390 : 2340;
  const points = market.history.slice(-count);
  return (
    <section className="chart-section" aria-label={market.symbol + ' price chart'}>
      <div className="section-heading">
        <h2>Price history</h2>
        <div className="segmented compact" aria-label="Chart range">
          {['1H', '1D', 'ALL'].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={range === r ? 'selected' : ''}
              aria-pressed={range === r}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="price-chart">
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 600, height: 250 }}
        >
          <AreaChart data={points} margin={{ top: 15, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="price-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#169477" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#169477" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#e9eeed" strokeDasharray="3 4" />
            <XAxis
              dataKey="tick"
              tickFormatter={time}
              minTickGap={70}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: '#77827f' }}
              dy={8}
            />
            <YAxis
              domain={['auto', 'auto']}
              orientation="right"
              tickFormatter={(v) => '$' + v.toFixed(0)}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: '#77827f' }}
              width={58}
            />
            <Tooltip
              formatter={(v) => [currency(v), 'Price']}
              labelFormatter={time}
              contentStyle={{ border: '1px solid #dce4e1', borderRadius: 6, fontSize: 13 }}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke="#148369"
              strokeWidth={2.3}
              fill="url(#price-fill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-foot">
        <span>USD</span>
        <span>{number(points.length)} simulated minutes</span>
      </div>
    </section>
  );
}
export function Sparkline({ data, color = '#148369' }) {
  return (
    <div className="sparkline" aria-hidden="true">
      <ResponsiveContainer width="100%" height={29} initialDimension={{ width: 98, height: 29 }}>
        <AreaChart data={data.slice(-45)}>
          <Area
            dataKey="price"
            stroke={color}
            fill="transparent"
            strokeWidth={1.6}
            isAnimationActive={false}
          />
          <YAxis hide domain={['dataMin', 'dataMax']} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function Allocation({ portfolio, markets }) {
  const values = [
    { name: 'Cash', value: Math.max(0, portfolio.cash), color: '#d9e4e0' },
    ...portfolio.holdings.map((h) => ({
      name: h.symbol,
      value: h.value,
      color: markets.find((m) => m.symbol === h.symbol).color,
    })),
    ...portfolio.positions.map((p) => ({
      name: p.symbol + ' ' + p.instrument,
      value: Math.max(0, p.value),
      color: '#8364b1',
    })),
  ];
  const totalAssets = values.reduce((sum, asset) => sum + asset.value, 0);
  return (
    <div className="allocation">
      <div className="donut">
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 200, height: 177 }}
        >
          <PieChart>
            <Pie
              data={values}
              dataKey="value"
              innerRadius={57}
              outerRadius={78}
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
            >
              {values.map((v, i) => (
                <Cell key={i} fill={v.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => currency(value)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <strong>{portfolio.holdings.length}</strong>
          <span>stocks held</span>
        </div>
      </div>
      <div className="allocation-legend">
        {values.map((v, i) => (
          <div key={i}>
            <span>
              <i style={{ background: v.color }} />
              {v.name}
            </span>
            <strong>{(totalAssets ? (v.value / totalAssets) * 100 : 0).toFixed(1)}%</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
