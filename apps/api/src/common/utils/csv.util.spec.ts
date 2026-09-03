import { BadRequestException } from '@nestjs/common';
import {
  CSV_MAX_ROWS,
  csvDate,
  csvMoneyFC,
  csvNumber,
  csvRow,
  csvText,
  writeCsvResponse,
} from './csv.util';

describe('csvText', () => {
  it('passes plain values through unquoted', () => {
    expect(csvText('Boutique Marie')).toBe('Boutique Marie');
  });

  it('returns an empty string for null / undefined / empty', () => {
    expect(csvText(null)).toBe('');
    expect(csvText(undefined)).toBe('');
    expect(csvText('')).toBe('');
  });

  it('quotes values containing a comma, quote, LF or CRLF', () => {
    expect(csvText('Kolwezi, Lualaba')).toBe('"Kolwezi, Lualaba"');
    expect(csvText('Chaîne 22"')).toBe('"Chaîne 22"""');
    expect(csvText('ligne1\nligne2')).toBe('"ligne1\nligne2"');
    expect(csvText('ligne1\r\nligne2')).toBe('"ligne1\r\nligne2"');
  });

  it('preserves French accents untouched', () => {
    expect(csvText('Épicerie Générale à Lubumbashi')).toBe(
      'Épicerie Générale à Lubumbashi',
    );
  });

  // The defect this utility exists to fix: `escapeCsv` did RFC-4180 quoting
  // only, so a seller-supplied businessName landed in the finance CSV verbatim.
  describe('formula injection', () => {
    it.each([
      ["=cmd|'/c calc'!A1", `"'=cmd|'/c calc'!A1"`],
      ['+1+1', `"'+1+1"`],
      ['-2+3', `"'-2+3"`],
      ['@SUM(A1:A9)', `"'@SUM(A1:A9)"`],
      ['\tHIDDEN', `"'\tHIDDEN"`],
      ['\rHIDDEN', `"'\rHIDDEN"`],
    ])('neutralises %j', (input, expected) => {
      expect(csvText(input)).toBe(expected);
    });

    it('neutralises a payload hidden behind leading whitespace', () => {
      // A naive first-character check lets this through; Excel still evaluates it.
      expect(csvText(' =HYPERLINK("http://evil","x")')).toBe(
        `"' =HYPERLINK(""http://evil"",""x"")"`,
      );
    });

    it('neutralises a payload hidden behind a leading BOM or NBSP', () => {
      expect(csvText('﻿=1+1')).toBe(`"'﻿=1+1"`);
      expect(csvText(' =1+1')).toBe(`"' =1+1"`);
    });

    it('does not touch a value that merely contains = later on', () => {
      expect(csvText('Taille=M')).toBe('Taille=M');
    });
  });
});

describe('csvNumber', () => {
  it('renders integers, bigints and numeric strings', () => {
    expect(csvNumber(0)).toBe('0');
    expect(csvNumber(42)).toBe('42');
    expect(csvNumber(BigInt('9007199254740993'))).toBe('9007199254740993');
    expect(csvNumber('17')).toBe('17');
  });

  it('returns an empty string for null / undefined / empty', () => {
    expect(csvNumber(null)).toBe('');
    expect(csvNumber(undefined)).toBe('');
    expect(csvNumber('')).toBe('');
  });

  // Regression guard. Applying the formula prefix to numbers would turn every
  // negative amount into text and silently break SUM() in the finance sheet —
  // which is why the guard lives in csvText and nowhere else.
  it('does NOT formula-prefix a negative number', () => {
    expect(csvNumber(-500)).toBe('-500');
    expect(csvNumber(BigInt(-1))).toBe('-1');
  });

  it('throws when handed something non-numeric', () => {
    expect(() => csvNumber('=1+1')).toThrow(/non-numeric/);
  });
});

describe('csvMoneyFC', () => {
  it('converts centimes to whole francs with no grouping or suffix', () => {
    // formatFC would render this "52.957 FC", which Excel reads as text.
    expect(csvMoneyFC(BigInt(5295700))).toBe('52957');
    expect(csvMoneyFC(0)).toBe('0');
  });

  it('rounds half away from zero, symmetrically for negatives', () => {
    expect(csvMoneyFC(150)).toBe('2');
    expect(csvMoneyFC(-150)).toBe('-2');
    expect(csvMoneyFC(149)).toBe('1');
    expect(csvMoneyFC(-149)).toBe('-1');
  });

  it('returns an empty string for null / undefined', () => {
    expect(csvMoneyFC(null)).toBe('');
    expect(csvMoneyFC(undefined)).toBe('');
  });

  it('throws when handed something non-numeric', () => {
    expect(() => csvMoneyFC('abc')).toThrow(/non-numeric/);
  });
});

describe('csvDate', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(csvDate(new Date('2026-06-08T10:00:00Z'))).toBe('2026-06-08');
  });

  it('returns an empty string for null', () => {
    expect(csvDate(null)).toBe('');
    expect(csvDate(undefined)).toBe('');
  });
});

describe('csvRow', () => {
  it('joins cells with a comma and terminates with LF', () => {
    expect(csvRow(['a', 'b', ''])).toBe('a,b,\n');
  });
});

describe('writeCsvResponse', () => {
  function mockRes() {
    return {
      setHeader: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    };
  }

  it('writes the BOM exactly once, then the header row, then the data rows', () => {
    const res = mockRes();
    writeCsvResponse(res as never, {
      filename: 'ventes-2026-06-08.csv',
      headers: ['Date', 'Vendeur'],
      rows: [
        ['2026-06-08', 'Boutique Marie'],
        ['2026-06-09', '"Chez Jean"'],
      ],
    });

    const written = res.write.mock.calls.map((c) => c[0] as string);
    expect(written[0]).toBe('﻿');
    expect(written.filter((w) => w === '﻿')).toHaveLength(1);
    expect(written[1]).toBe('Date,Vendeur\n');
    expect(written[2]).toBe('2026-06-08,Boutique Marie\n');
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  it('sets the CSV content type and the download filename', () => {
    const res = mockRes();
    writeCsvResponse(res as never, {
      filename: 'ventes.csv',
      headers: ['Date'],
      rows: [],
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/csv; charset=utf-8',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename=ventes.csv',
    );
  });

  it('still emits a well-formed file when there are no rows', () => {
    const res = mockRes();
    writeCsvResponse(res as never, {
      filename: 'vide.csv',
      headers: ['Date', 'Total (FC)'],
      rows: [],
    });
    expect(res.write.mock.calls.map((c) => c[0])).toEqual([
      '﻿',
      'Date,Total (FC)\n',
    ]);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  // The throw has to land BEFORE any header is set, or HttpExceptionFilter
  // cannot serialise the error and the client gets a truncated CSV instead.
  it('rejects an over-cap export without writing anything', () => {
    const res = mockRes();
    const rows = Array.from({ length: CSV_MAX_ROWS + 1 }, () => ['x']);
    expect(() =>
      writeCsvResponse(res as never, {
        filename: 'trop.csv',
        headers: ['Col'],
        rows,
      }),
    ).toThrow(BadRequestException);
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(res.write).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });
});
