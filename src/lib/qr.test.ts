import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { QUIET_ZONE, qrMatrix, qrPath } from './qr';

/** Draws the SVG path's rectangles into pixels, the way a printer would, then reads the code back. */
function rasterize(path: string, modules: number, scale: number): { data: Uint8ClampedArray; width: number } {
  const width = modules * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (const [, x, y, w] of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let py = Number(y) * scale; py < (Number(y) + 1) * scale; py++) {
      for (let px = Number(x) * scale; px < (Number(x) + Number(w)) * scale; px++) {
        const i = (py * width + px) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
    }
  }
  return { data, width };
}

describe('QR code', () => {
  it.each([
    'https://mishnayos.example.org/c/chart234',
    'http://localhost:5173/c/abcd2345',
    'https://a-much-longer-domain-name-for-a-campaign.example.org/c/zzzz9999',
  ])('decodes back to exactly %s', (url) => {
    const matrix = qrMatrix(url);
    const modules = matrix.size + QUIET_ZONE * 2;
    const { data, width } = rasterize(qrPath(matrix), modules, 6);
    expect(jsQR(data, width, width)?.data).toBe(url);
  });

  it('draws only inside the quiet zone', () => {
    const matrix = qrMatrix('https://mishnayos.example.org/c/chart234');
    for (const [, x, y, w] of qrPath(matrix).matchAll(/M(\d+) (\d+)h(\d+)/g)) {
      expect(Number(x)).toBeGreaterThanOrEqual(QUIET_ZONE);
      expect(Number(y)).toBeGreaterThanOrEqual(QUIET_ZONE);
      expect(Number(x) + Number(w)).toBeLessThanOrEqual(matrix.size + QUIET_ZONE);
    }
  });
});
