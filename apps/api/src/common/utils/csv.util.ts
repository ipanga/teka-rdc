import { BadRequestException } from '@nestjs/common';
import type { Response } from 'express';

/**
 * CSV export helpers, shared by every admin report.
 *
 * Two rules drive the design, and both are easy to get wrong:
 *
 * 1. **Formula injection is a text-cell concern only.** A spreadsheet treats a
 *    cell starting with `=`, `+`, `-`, `@`, TAB or CR as a formula, so any
 *    user-controlled text must be neutralised. Applying that guard to NUMBERS
 *    would be a bug of its own: every negative amount would gain a `'` prefix
 *    and Excel would read the column as text, silently breaking `SUM()`. Hence
 *    separate `csvText` / `csvNumber` / `csvMoneyFC` rather than one generic
 *    escape function.
 *
 * 2. **Money is exported as integer francs, never through a UI formatter.**
 *    `formatFC` in `@teka/shared` emits "52.957 FC" — dot thousands separators
 *    plus a currency suffix — which every Excel locale reads as text. CSV money
 *    is a bare integer; the unit belongs in the column header.
 */

/** Hard cap on exported rows. Beyond this the caller must narrow its filters. */
export const CSV_MAX_ROWS = 50_000;

// A leading `'` makes a spreadsheet treat the rest of the cell as literal text.
// The characters below are the ones Excel / LibreOffice / Sheets treat as the
// start of a formula. TAB and CR are included because they can be used to shift
// the payload past a naive prefix check.
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/** True when the value would be parsed as a formula by a spreadsheet. */
function looksLikeFormula(value: string): boolean {
  // Two checks, and both are needed.
  //
  // The RAW check catches a leading TAB or CR, which are themselves treated as
  // formula-starting characters. The TRIMMED check catches a payload hidden
  // behind leading whitespace — " =HYPERLINK(...)" is still evaluated by Excel,
  // so testing the first character alone would let it through.
  //
  // Trimming cannot replace the raw check: `\s` matches TAB and CR, so trimming
  // first would strip exactly the characters the raw check is looking for.
  if (FORMULA_PREFIXES.some((p) => value.startsWith(p))) return true;
  const trimmed = value.replace(/^[\s\uFEFF\u00A0]+/, '');
  return FORMULA_PREFIXES.some((p) => trimmed.startsWith(p));
}

/** RFC-4180: wrap in double quotes and double any embedded quote. */
function quote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * A free-text cell. Neutralises formula injection, then applies RFC-4180
 * quoting. Use this for EVERY cell whose content can originate from a user —
 * seller business names, buyer names, rejection reasons, search terms.
 */
export function csvText(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const raw = String(value);
  if (looksLikeFormula(raw)) {
    // Quote unconditionally: the `'` alone is not enough if the value also
    // contains a comma or a newline.
    return quote(`'${raw}`);
  }
  return /[",\n\r]/.test(raw) ? quote(raw) : raw;
}

/**
 * A numeric cell. Deliberately NOT formula-guarded — see the file header.
 * Numbers never carry user input, so the only risk here is emitting something
 * that is not a number, which the assertion below catches in tests.
 */
export function csvNumber(
  value: number | bigint | string | null | undefined,
): string {
  if (value === null || value === undefined || value === '') return '';
  const out = typeof value === 'bigint' ? value.toString() : String(value);
  if (!/^-?\d+(\.\d+)?$/.test(out)) {
    throw new Error(`csvNumber received a non-numeric value: ${out}`);
  }
  return out;
}

/**
 * Money cell: centimes → whole francs, as a bare integer with no grouping and
 * no currency suffix. FC has no circulating sub-unit, so rounding to the franc
 * loses nothing. Put the unit in the header, e.g. « Total (FC) ».
 */
export function csvMoneyFC(
  centimes: bigint | number | string | null | undefined,
): string {
  if (centimes === null || centimes === undefined || centimes === '') return '';
  const n = typeof centimes === 'bigint' ? Number(centimes) : Number(centimes);
  if (!Number.isFinite(n)) {
    throw new Error(`csvMoneyFC received a non-numeric value: ${String(centimes)}`);
  }
  // Round half away from zero so -150 centimes → -2 FC, not -1.
  const francs = n < 0 ? -Math.round(-n / 100) : Math.round(n / 100);
  return String(francs);
}

/** A YYYY-MM-DD date cell. */
export function csvDate(date: Date | null | undefined): string {
  if (!date) return '';
  return date.toISOString().split('T')[0];
}

/**
 * Joins pre-escaped cells into one CSV line.
 *
 * LF, not CRLF: the four generators this replaces emit `\n` today and this
 * refactor deliberately keeps their output byte-identical apart from
 * neutralised injection payloads. Excel reads either.
 */
export function csvRow(cells: string[]): string {
  return `${cells.join(',')}\n`;
}

/**
 * Streams a complete CSV response.
 *
 * `rows` is consumed BEFORE any header is written when it is an array, so a
 * row-cap rejection can still be serialised as JSON by `HttpExceptionFilter`.
 * Once `res.setHeader` has run, throwing produces an unusable half-response —
 * which is exactly what the previous hand-rolled generators risked.
 */
export function writeCsvResponse(
  res: Response,
  opts: { filename: string; headers: string[]; rows: string[][] },
): void {
  if (opts.rows.length > CSV_MAX_ROWS) {
    throw new BadRequestException(
      `Trop de lignes (plus de ${CSV_MAX_ROWS.toLocaleString('fr-FR')}). Réduisez la plage de dates.`,
    );
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=${opts.filename}`,
  );

  // BOM so Excel detects UTF-8 and renders French accents correctly.
  res.write('\uFEFF');
  res.write(csvRow(opts.headers));
  for (const row of opts.rows) {
    res.write(csvRow(row));
  }
  res.end();
}
