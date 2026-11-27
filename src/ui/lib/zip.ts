// biome-ignore-all lint/suspicious/noBitwiseOperators: a CRC-32 and the zip headers are bit arithmetic by definition
/**
 * A zip file of files stored as they are, uncompressed: QR pictures are small, and SVG and PNG gain
 * little from deflating. Enough of the format for every unzip tool, and no library to carry.
 */

type ZipEntry = { name: string; bytes: Uint8Array };

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xff_ff_ff_ff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
};

/** Bit 11: the names are UTF-8, so "Hội thảo.png" arrives as typed. */
const UTF8_NAMES = 0x08_00;

const header = (size: number, write: (view: DataView) => void): Uint8Array => {
  const bytes = new Uint8Array(size);
  write(new DataView(bytes.buffer));
  return bytes;
};

const zip = (entries: readonly ZipEntry[]): Uint8Array<ArrayBuffer> => {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;
    const local = header(30, (view) => {
      view.setUint32(0, 0x04_03_4b_50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, UTF8_NAMES, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, size, true);
      view.setUint32(22, size, true);
      view.setUint16(26, name.length, true);
    });
    central.push(
      header(46, (view) => {
        view.setUint32(0, 0x02_01_4b_50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 20, true);
        view.setUint16(8, UTF8_NAMES, true);
        view.setUint32(16, crc, true);
        view.setUint32(20, size, true);
        view.setUint32(24, size, true);
        view.setUint16(28, name.length, true);
        view.setUint32(42, offset, true);
      }),
      name
    );
    parts.push(local, name, entry.bytes);
    offset += local.length + name.length + size;
  }
  const directorySize = central.reduce((sum, part) => sum + part.length, 0);
  const end = header(22, (view) => {
    view.setUint32(0, 0x06_05_4b_50, true);
    view.setUint16(8, entries.length, true);
    view.setUint16(10, entries.length, true);
    view.setUint32(12, directorySize, true);
    view.setUint32(16, offset, true);
  });
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of all) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

export { crc32, type ZipEntry, zip };
