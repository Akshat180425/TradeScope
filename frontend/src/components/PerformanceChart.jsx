import { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { currency, percent, time } from '../lib/api.js';
export function PerformanceChart({ performance, portfolio }) {
  const [mode, setMode] = useState('equity');
  const history = performance?.history || [];
  const points = history
    .filter(
      (p, i) => i === history.length - 1 || i % Math.max(1, Math.floor(history.length / 400)) === 0,
    )
    .map((p) => ({ ...p, return: p.index - 100 }));
  return (
    <section className="performance-section">
      <div className="section-heading">
        <div>
          <h2>Portfolio performance</h2>
          <span className="muted">Recorded since {time(performance?.sinceTick || 0)}</span>
        </div>
        <div className="segmented compact">
          <button className={mode === 'equity' ? 'selected' : ''} onClick={() => setMode('equity')}>
            Value
          </button>
          <button className={mode === 'return' ? 'selected' : ''} onClick={() => setMode('return')}>
            Return
          </button>
        </div>
      </div>
      <div className="performance-metrics">
        <div>
          <span>Time-weighted return</span>
          <strong className={(performance?.returnPercent || 0) < 0 ? 'negative' : 'positive'}>
            {percent(performance?.returnPercent || 0)}
          </strong>
        </div>
        <div>
          <span>Maximum drawdown</span>
          <strong>{(performance?.maxDrawdown || 0).toFixed(2)}%</strong>
        </div>
        <div>
          <span>Unrealized P&L</span>
          <strong>{currency(portfolio.unrealizedPnl)}</strong>
        </div>
      </div>
      {points.length > 1 ? (
        <div className="performance-chart">
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={{ width: 700, height: 200 }}
          >
            <AreaChart data={points} margin={{ top: 12, left: 0, right: 10, bottom: 4 }}>
              <CartesianGrid vertical={false} stroke="#e6edea" strokeDasharray="3 4" />
              <XAxis
                dataKey="tick"
                tickFormatter={time}
                minTickGap={80}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                orientation="right"
                width={84}
                domain={['auto', 'auto']}
                tickFormatter={(v) => (mode === 'equity' ? currency(v, 0) : v.toFixed(1) + '%')}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                labelFormatter={time}
                formatter={(v) => (mode === 'equity' ? currency(v) : percent(v))}
              />
              <Area
                dataKey={mode}
                type="linear"
                stroke="#207dba"
                fill="#eaf3f8"
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="empty-state compact-empty">
          <h3>First performance snapshot recorded</h3>
          <span>
            {currency(portfolio.equity)} / {time(performance?.sinceTick || 0)}
          </span>
        </div>
      )}
    </section>
  );
}
