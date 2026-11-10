import QRCode from 'qrcode';

export interface QrMatrix {
  /** Modules per side, without the quiet zone. */
  size: number;
  isDark: (row: number, column: number) => boolean;
}

/** The QR code for a piece of text, at error correction level M. */
export function qrMatrix(text: string): QrMatrix {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  return { size: modules.size, isDark: (row, column) => modules.get(row, column) === 1 };
}

/** The blank border a scanner needs around the code, in modules. */
export const QUIET_ZONE = 4;

/** One SVG path covering every dark module, in a viewBox of `size + 2 * QUIET_ZONE`. */
export function qrPath(matrix: QrMatrix): string {
  let path = '';
  for (let row = 0; row < matrix.size; row++) {
    for (let column = 0; column < matrix.size; column++) {
      if (!matrix.isDark(row, column)) continue;
      // Merge a run of dark modules in this row into one rectangle.
      let end = column;
      while (end + 1 < matrix.size && matrix.isDark(row, end + 1)) end++;
      path += `M${column + QUIET_ZONE} ${row + QUIET_ZONE}h${end - column + 1}v1h-${end - column + 1}z`;
      column = end;
    }
  }
  return path;
}
