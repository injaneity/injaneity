// SVG filter that gives content an e-ink rendering: add a tiled 4x4 Bayer
// threshold pattern, then posterize each color channel to a handful of
// levels. The Bayer offset before quantization is what produces ordered
// dithering on antialiased edges and images. Color is preserved (no
// desaturation) so accent colors and link highlights keep their meaning.

// 4x4 Bayer matrix (values 0..15) as an inline SVG tile.
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const bayerTileSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4">${BAYER_4X4
  .flatMap((row, y) =>
    row.map((v, x) => {
      const level = Math.round((v / 15) * 255);
      return `<rect x="${x}" y="${y}" width="1" height="1" fill="rgb(${level},${level},${level})"/>`;
    })
  )
  .join('')}</svg>`;

const BAYER_DATA_URI = `data:image/svg+xml,${encodeURIComponent(bayerTileSvg)}`;

// 6 output levels per channel: enough to keep hues recognizable while still
// posterizing visibly, biased toward paper-white and soft black ink.
const QUANT_LEVELS = '0.08 0.27 0.45 0.63 0.81 0.99';

// Dither amplitude: one quantization step (1/5 for 6 levels), centered on 0.
const DITHER_SCALE = 1 / 5;

export const EInkDitherFilter: React.FC = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
    <defs>
      <filter id="eink-dither" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feImage href={BAYER_DATA_URI} width="4" height="4" result="bayerTile" />
        <feTile in="bayerTile" result="bayer" />
        {/* source + scale * (bayer - 0.5), keeping the source alpha */}
        <feComposite
          in="SourceGraphic"
          in2="bayer"
          operator="arithmetic"
          k1="0"
          k2="1"
          k3={DITHER_SCALE}
          k4={-DITHER_SCALE / 2}
          result="biased"
        />
        <feComponentTransfer in="biased" result="quantized">
          <feFuncR type="discrete" tableValues={QUANT_LEVELS} />
          <feFuncG type="discrete" tableValues={QUANT_LEVELS} />
          <feFuncB type="discrete" tableValues={QUANT_LEVELS} />
        </feComponentTransfer>
        {/* Clip back to the source alpha so transparent areas stay transparent */}
        <feComposite in="quantized" in2="SourceGraphic" operator="in" />
      </filter>
    </defs>
  </svg>
);
