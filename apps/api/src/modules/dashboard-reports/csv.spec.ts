import { csvDocument } from './csv';

describe('CSV serializer', () => {
  it('quotes cells, keeps bigint exact, and neutralizes spreadsheet formulas', () => {
    const csv = csvDocument(
      ['Name', 'Amount', 'Note'],
      [['=HYPERLINK("bad")', 9_007_199_254_740_993n, 'line one\nline two']],
    );
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(csv).toContain('"9007199254740993"');
    expect(csv).toContain('"line one\nline two"');
  });
});
