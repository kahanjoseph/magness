// Build-time access to the design tokens for things CSS can't style directly:
// the favicon, <meta name="theme-color">, the palette studio defaults and the
// no-JavaScript contact reply page. The values are read from the :root block in
// global.css, so that block stays the single place to change a color.
import css from './global.css?raw';

const root = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? '';
export const tokens: Readonly<Record<string, string>> = Object.fromEntries(
  [...root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
);

export function token(name: `--${string}`): string {
  const value = tokens[name];
  if (!value) throw new Error(`Design token ${name} is not defined in global.css :root`);
  return value;
}
