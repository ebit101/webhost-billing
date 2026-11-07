import { csvDocument } from './csv';

describe('CSV serializer', () => {
  it('neutralizes formulas hidden behind whitespace and leading spreadsheet controls', () => {
    for (const value of [
      ' =1+1',
      '\t=HYPERLINK("fictional")',
      '\r+CMD()',
      '\n@SUM(1)',
      '\uFEFF-1+1',
    ]) {
      expect(csvDocument(['Label'], [[value]])).toContain(
        `"'${value.replaceAll('"', '""')}"`,
      );
    }
    expect(csvDocument(['Name'], [['Fictional host']])).toContain(
      '"Fictional host"',
    );
  });
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
