import { isStockConflict, stockEditFields } from './stock-edit';

describe('stockEditFields', () => {
  it('sends the loaded stock as the optimistic snapshot', () => {
    expect(stockEditFields(12, 4)).toEqual({ quantity: 12, expectedQuantity: 4 });
  });

  it('an untouched field sends quantity === expectedQuantity (the API writes nothing)', () => {
    expect(stockEditFields(4, 4)).toEqual({ quantity: 4, expectedQuantity: 4 });
  });

  it('zero is a real snapshot, not "missing"', () => {
    expect(stockEditFields(3, 0)).toEqual({ quantity: 3, expectedQuantity: 0 });
  });

  it('without a loaded product it falls back to the legacy payload', () => {
    expect(stockEditFields(3, undefined)).toEqual({ quantity: 3 });
  });
});

describe('isStockConflict', () => {
  it('recognises the 409 refusal only', () => {
    expect(isStockConflict({ status: 409, message: 'Le stock…' })).toBe(true);
    expect(isStockConflict({ status: 400 })).toBe(false);
    expect(isStockConflict(new Error('x'))).toBe(false);
    expect(isStockConflict(null)).toBe(false);
  });
});
