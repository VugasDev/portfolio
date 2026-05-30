import type { APIRoute } from 'astro';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { getAllOgEntries } from '../../lib/og';
import { ogTemplate } from '../../lib/og-template';
import { loadOgFonts } from '../../lib/og-fonts';

export async function getStaticPaths() {
  const entries = await getAllOgEntries();
  return entries.map(e => ({
    params: { slug: e.slug },
    props: { title: e.title, kicker: e.kicker },
  }));
}

export const GET: APIRoute = async ({ props }) => {
  const { title, kicker } = props as { title: string; kicker: string };
  const fonts = await loadOgFonts();

  const svg = await satori(ogTemplate({ title: title || 'VUGAS.DE', kicker: kicker || 'VUGAS.DE' }) as never, {
    width: 1200,
    height: 630,
    fonts: fonts.map(f => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
  });

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();

  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
