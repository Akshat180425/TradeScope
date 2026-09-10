import { useEffect, useRef } from 'react';

export function usePortfolioTool(portfolio) {
  const current = useRef(portfolio);
  current.current = portfolio;

  useEffect(() => {
    const registry = document.modelContext;
    if (!registry?.registerTool) return;
    const lifecycle = new AbortController();
    const tool = {
      name: 'get_tradescope_portfolio',
      title: 'Read selected portfolio',
      description:
        'Read the currently selected simulated account, balances, holdings, and open positions.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        if (
          !input ||
          typeof input !== 'object' ||
          Array.isArray(input) ||
          Object.keys(input).length
        ) {
          throw new Error('This tool accepts an empty object only.');
        }
        if (!current.current) throw new Error('The selected portfolio is still loading.');
        return structuredClone(current.current);
      },
    };
    try {
      Promise.resolve(registry.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});
    } catch {
      // The trading UI remains available in browsers without the proposed API.
    }
    return () => lifecycle.abort();
  }, []);
}
