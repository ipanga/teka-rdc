import {
  declaredTypeMatches,
  sanitizeFilename,
  sniffDocument,
  stripImageMetadata,
} from './document-validation';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n', 'latin1');
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
}
function pngWithText(): Buffer {
  return Buffer.concat([
    PNG_SIG,
    pngChunk('IHDR', Buffer.alloc(13)),
    pngChunk('tEXt', Buffer.from('Comment\0TEKA-GPS-MARKER', 'latin1')),
    pngChunk('eXIf', Buffer.from('EXIFDATA', 'latin1')),
    pngChunk('IDAT', Buffer.from([1, 2, 3])),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
function jpegSegment(marker: number, payload: Buffer): Buffer {
  const len = Buffer.alloc(2);
  len.writeUInt16BE(payload.length + 2);
  return Buffer.concat([Buffer.from([0xff, marker]), len, payload]);
}
function jpegWithExif(): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    jpegSegment(0xe0, Buffer.from('JFIF\0', 'latin1')),
    jpegSegment(0xe1, Buffer.from('Exif\0\0TEKA-GPS-MARKER', 'latin1')),
    jpegSegment(0xfe, Buffer.from('a comment', 'latin1')),
    jpegSegment(0xdb, Buffer.alloc(3)), // DQT (kept)
    jpegSegment(0xda, Buffer.alloc(2)), // SOS
    Buffer.from([0x12, 0x34, 0xff, 0xd9]),
  ]);
}
function webpWithExif(): Buffer {
  const chunk = (t: string, d: Buffer) => {
    const l = Buffer.alloc(4);
    l.writeUInt32LE(d.length);
    return Buffer.concat([Buffer.from(t, 'latin1'), l, d, d.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  };
  const body = Buffer.concat([
    Buffer.from('WEBP', 'latin1'),
    chunk('VP8 ', Buffer.from([1, 2, 3, 4])),
    chunk('EXIF', Buffer.from('TEKA-GPS-MARKER', 'latin1')),
  ]);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(body.length);
  return Buffer.concat([Buffer.from('RIFF', 'latin1'), size, body]);
}

describe('sniffDocument — the accepted kind comes from the bytes, not the client', () => {
  it('recognises PDF, JPEG, PNG and WebP', () => {
    expect(sniffDocument(PDF)?.kind).toBe('pdf');
    expect(sniffDocument(PDF)?.resourceType).toBe('raw');
    expect(sniffDocument(jpegWithExif())).toMatchObject({ kind: 'jpeg', mimeType: 'image/jpeg', resourceType: 'image', extension: 'jpg' });
    expect(sniffDocument(pngWithText())).toMatchObject({ kind: 'png', mimeType: 'image/png' });
    expect(sniffDocument(webpWithExif())).toMatchObject({ kind: 'webp', mimeType: 'image/webp' });
  });

  it('rejects executables, archives, SVG, HTML and truncated files', () => {
    expect(sniffDocument(Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00', 'latin1'))).toBeNull(); // PE
    expect(sniffDocument(Buffer.from('\x7fELF\x02\x01\x01\x00\x00\x00', 'latin1'))).toBeNull(); // ELF
    expect(sniffDocument(Buffer.from('PK\x03\x04\x14\x00\x00\x00\x08\x00', 'latin1'))).toBeNull(); // zip/docx
    expect(sniffDocument(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull();
    expect(sniffDocument(Buffer.from('<!doctype html><html></html>'))).toBeNull();
    expect(sniffDocument(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe('declaredTypeMatches — a forged Content-Type is refused', () => {
  it('accepts an agreeing declaration and rejects a lying one', () => {
    const pdf = sniffDocument(PDF)!;
    expect(declaredTypeMatches('application/pdf', pdf)).toBe(true);
    expect(declaredTypeMatches('image/jpeg', pdf)).toBe(false); // PDF renamed .jpg
    const jpeg = sniffDocument(jpegWithExif())!;
    expect(declaredTypeMatches('image/jpg', jpeg)).toBe(true);
    expect(declaredTypeMatches('image/png', jpeg)).toBe(false);
    expect(declaredTypeMatches('application/octet-stream', jpeg)).toBe(false);
    expect(declaredTypeMatches(undefined, jpeg)).toBe(false);
  });
});

describe('stripImageMetadata — EXIF / XMP / text chunks never reach storage', () => {
  it('drops APP1 and COM from a JPEG, keeps JFIF, tables, scan and EOI', () => {
    const out = stripImageMetadata(jpegWithExif(), 'jpeg');
    expect(out.toString('latin1')).not.toContain('TEKA-GPS-MARKER');
    expect(out.toString('latin1')).not.toContain('a comment');
    expect(out.toString('latin1')).toContain('JFIF');
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
    expect(out.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    expect(out.includes(Buffer.from([0xff, 0xdb]))).toBe(true);
    expect(out.includes(Buffer.from([0xff, 0xda]))).toBe(true);
  });

  it('drops tEXt/eXIf chunks from a PNG and keeps IHDR/IDAT/IEND', () => {
    const out = stripImageMetadata(pngWithText(), 'png');
    const s = out.toString('latin1');
    expect(s).not.toContain('TEKA-GPS-MARKER');
    expect(s).not.toContain('eXIf');
    expect(s).toContain('IHDR');
    expect(s).toContain('IDAT');
    expect(s).toContain('IEND');
    expect(out.subarray(0, 8)).toEqual(PNG_SIG);
  });

  it('drops the EXIF chunk from a WebP and fixes the RIFF size', () => {
    const out = stripImageMetadata(webpWithExif(), 'webp');
    expect(out.toString('latin1')).not.toContain('TEKA-GPS-MARKER');
    expect(out.toString('latin1')).toContain('VP8 ');
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
  });

  it('returns PDFs and unrecognised buffers untouched', () => {
    expect(stripImageMetadata(PDF, 'pdf')).toBe(PDF);
    const junk = Buffer.from('not an image');
    expect(stripImageMetadata(junk, 'jpeg')).toBe(junk);
  });
});

describe('sanitizeFilename', () => {
  it('strips paths, control chars, accents and caps the length', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Users\\Me\\RCCM Élan  (2026).pdf')).toBe('RCCM_Elan_2026_.pdf');
    expect(sanitizeFilename('..hidden\u0000name.jpg')).toBe('hidden_name.jpg');
    expect(sanitizeFilename('x'.repeat(300) + '.pdf')!.length).toBe(120);
    expect(sanitizeFilename('')).toBeNull();
    expect(sanitizeFilename(undefined)).toBeNull();
    expect(sanitizeFilename('###')).toBeNull();
  });
});
