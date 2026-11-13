import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import satori from 'satori';
import { token } from '../styles/tokens';

// 1200×630 social preview, rendered at build time from the palette tokens.
// Satori turns the text into vector shapes, so resvg needs no fonts to rasterize it.
// Both run as WebAssembly, so no native image binaries are required.
const fromModules = (path: string) => readFile(join(process.cwd(), 'node_modules', path));

type Node = { type: string; props: { style?: Record<string, unknown>; children?: Node | string | (Node | string)[] } };
const el = (type: string, style: Record<string, unknown>, children?: Node['props']['children']): Node => ({ type, props: { style, children } });

export const GET: APIRoute = async () => {
  const [medium, semibold, serif] = await Promise.all([
    fromModules('geist/dist/fonts/geist-sans/Geist-Medium.ttf'),
    fromModules('geist/dist/fonts/geist-sans/Geist-SemiBold.ttf'),
    fromModules('@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff'),
  ]);

  const card = el('div', { width: 1200, height: 630, display: 'flex', flexDirection: 'column', background: token('--background'), color: token('--foreground'), fontFamily: 'Geist' }, [
    el('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, padding: '64px 80px 0' }, [
      el('div', { display: 'flex', flexDirection: 'column', gap: 10 }, [
        el('div', { fontSize: 30, fontWeight: 600, letterSpacing: 8 }, 'MAGNESS'),
        el('div', { fontSize: 13, fontWeight: 500, letterSpacing: 4, color: token('--muted-foreground') }, 'SOFTWARE CONSULTING'),
      ]),
      el('div', { display: 'flex', flexDirection: 'column', marginTop: 'auto', marginBottom: 56, fontSize: 108, fontWeight: 500, lineHeight: 1 }, [
        el('div', { letterSpacing: '-0.055em' }, 'Software built'),
        el('div', { display: 'flex', alignItems: 'baseline' }, [
          el('span', { letterSpacing: '-0.055em' }, 'around'),
          el('span', { fontFamily: 'Instrument Serif', fontStyle: 'italic', fontWeight: 400, fontSize: 116, letterSpacing: '-0.02em', marginLeft: 22, color: token('--accent') }, 'your business.'),
        ]),
      ]),
    ]),
    el('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 96, padding: '0 80px', background: token('--primary'), color: token('--primary-foreground'), fontSize: 24 }, [
      el('div', { display: 'flex', alignItems: 'center', gap: 16, color: token('--inverse-muted') }, [
        el('div', { width: 12, height: 12, background: token('--brand-marker') }),
        'Custom applications · Integrations · Automation',
      ]),
      el('div', { fontWeight: 600, color: token('--brand-bright') }, 'magness.dev'),
    ]),
  ]);

  const svg = await satori(card as Parameters<typeof satori>[0], {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Geist', data: medium, weight: 500, style: 'normal' },
      { name: 'Geist', data: semibold, weight: 600, style: 'normal' },
      { name: 'Instrument Serif', data: serif, weight: 400, style: 'italic' },
    ],
  });
  await initWasm(await fromModules('@resvg/resvg-wasm/index_bg.wasm'));
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
