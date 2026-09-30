/** Renders rows as a GitHub-flavoured Markdown table (readable in the terminal too). */
export function markdownTable(headers: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  const cells = [headers, ...rows.map((r) => r.map(String))];
  const widths = headers.map((_, c) => Math.max(...cells.map((r) => (r[c] ?? '').length)));
  const line = (r: readonly string[]): string => `| ${r.map((cell, c) => cell.padEnd(widths[c] ?? 0)).join(' | ')} |`;
  const separator = `|${widths.map((w) => '-'.repeat(w + 2)).join('|')}|`;
  return [line(headers), separator, ...cells.slice(1).map(line)].join('\n');
}

export const pct = (x: number, digits = 2): string => `${(x * 100).toFixed(digits)}%`;

export const oneIn = (p: number): string => (p > 0 ? `1 in ${formatNumber(1 / p)}` : 'never');

export function formatNumber(x: number): string {
  if (x >= 100) return Math.round(x).toLocaleString('en-US');
  if (x >= 10) return x.toFixed(1);
  return x.toFixed(2);
}
