import {
  REPORT_TZ_OFFSET,
  resolveWindow,
  windowFilterFor,
} from './report-window.util';

describe('resolveWindow', () => {
  it('anchors the start to midnight CAT, not midnight UTC', () => {
    // 2026-06-01T00:00:00+02:00 === 2026-05-31T22:00:00Z
    expect(resolveWindow('2026-06-01').gte?.toISOString()).toBe(
      '2026-05-31T22:00:00.000Z',
    );
  });

  it('treats dateTo as inclusive by ending at midnight CAT the next day', () => {
    // An admin picking 30 June expects 30 June's rows, so `lt` is 1 July 00:00 CAT.
    expect(resolveWindow(undefined, '2026-06-30').lt?.toISOString()).toBe(
      '2026-06-30T22:00:00.000Z',
    );
  });

  it('is half-open, leaving no last-millisecond hole', () => {
    const { lt } = resolveWindow('2026-06-01', '2026-06-30');
    // The old helper used setHours(23,59,59,999) and dropped anything after it.
    const lastMs = new Date('2026-06-30T23:59:59.999+02:00');
    expect(lastMs.getTime()).toBeLessThan(lt!.getTime());
  });

  it('does not drift across a month end', () => {
    expect(resolveWindow(undefined, '2026-01-31').lt?.toISOString()).toBe(
      '2026-01-31T22:00:00.000Z',
    );
    expect(resolveWindow(undefined, '2026-02-28').lt?.toISOString()).toBe(
      '2026-02-28T22:00:00.000Z',
    );
  });

  it('does not drift across a leap day', () => {
    // 2028 is a leap year: the day after 28 Feb is 29 Feb, not 1 Mar.
    expect(resolveWindow(undefined, '2028-02-28').lt?.toISOString()).toBe(
      '2028-02-28T22:00:00.000Z',
    );
  });

  it('does not drift across a year end', () => {
    expect(resolveWindow(undefined, '2026-12-31').lt?.toISOString()).toBe(
      '2026-12-31T22:00:00.000Z',
    );
  });

  it('returns an empty window when neither bound is given', () => {
    expect(resolveWindow()).toEqual({});
    expect(resolveWindow(undefined, undefined)).toEqual({});
  });

  it('accepts one bound without the other', () => {
    expect(resolveWindow('2026-06-01').lt).toBeUndefined();
    expect(resolveWindow(undefined, '2026-06-30').gte).toBeUndefined();
  });

  it('narrows a full ISO timestamp to its calendar day', () => {
    expect(resolveWindow('2026-06-01T15:30:00.000Z').gte?.toISOString()).toBe(
      '2026-05-31T22:00:00.000Z',
    );
  });

  it('ignores an unparseable date rather than producing an Invalid Date', () => {
    expect(resolveWindow('pas-une-date')).toEqual({});
  });

  // The regression this util exists for: the previous buildDateFilter called
  // setHours(), which reads the SERVER's timezone, so the same query returned
  // different rows depending on where the container ran.
  it('is independent of the machine timezone', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      const la = resolveWindow('2026-06-01', '2026-06-30');
      process.env.TZ = 'Asia/Tokyo';
      const tokyo = resolveWindow('2026-06-01', '2026-06-30');
      expect(la.gte!.toISOString()).toBe(tokyo.gte!.toISOString());
      expect(la.lt!.toISOString()).toBe(tokyo.lt!.toISOString());
    } finally {
      process.env.TZ = original;
    }
  });

  it('pins the offset to CAT', () => {
    expect(REPORT_TZ_OFFSET).toBe('+02:00');
  });
});

describe('windowFilterFor', () => {
  it('keys the window on the requested column', () => {
    expect(windowFilterFor('deliveredAt', '2026-06-01', '2026-06-30')).toEqual({
      deliveredAt: {
        gte: new Date('2026-05-31T22:00:00.000Z'),
        lt: new Date('2026-06-30T22:00:00.000Z'),
      },
    });
  });

  it('spreads to nothing when no bound is supplied', () => {
    expect(windowFilterFor('createdAt')).toEqual({});
    expect({ deletedAt: null, ...windowFilterFor('createdAt') }).toEqual({
      deletedAt: null,
    });
  });
});
