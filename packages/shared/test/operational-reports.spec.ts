import test from 'node:test';
import assert from 'node:assert/strict';
import {
  operationalReportRequestSchema,
  operationalReportIdSchema,
  operationalReports,
  operationalReportResponseSchema,
} from '../src/contracts/operational-reports';
test('reports accept only bounded pages, complete valid business-date pairs and known reports', () => {
  assert.deepEqual(operationalReportRequestSchema.parse({}), {
    page: 1,
    pageSize: 20,
  });
  assert.ok(
    operationalReportRequestSchema.safeParse({
      from: '2028-02-29',
      to: '2028-03-01',
      page: '2',
      pageSize: '100',
    }).success,
  );
  for (const input of [
    { from: '2028-04-01' },
    { from: '2028-02-30', to: '2028-03-01' },
    { page: Infinity },
    { page: 1000001 },
    { pageSize: 101 },
    { currency: 'USD' },
    { where: '1=1' },
  ])
    assert.equal(
      operationalReportRequestSchema.safeParse(input).success,
      false,
    );
  assert.equal(
    operationalReportIdSchema.safeParse('../../payments').success,
    false,
  );
});
test('report definitions explicitly separate cash, balances, forecasts and current queues', () => {
  assert.equal(Object.keys(operationalReports).length, 7);
  assert.match(operationalReports.income.notes, /unattributed/i);
  assert.match(operationalReports.recurring.notes, /not collected income/);
  assert.match(operationalReports.cancellations.notes, /dates do not filter/);
  assert.equal(operationalReports['domain-renewals'].columns[2].format, 'text');
});

test('responses preserve exact signed monetary integers and reject malformed numeric columns', () => {
  const value = {
    report: 'income',
    generatedAt: '2028-04-01T00:00:00.000Z',
    currency: 'BDT',
    timeZone: 'Asia/Dhaka',
    period: { from: '2028-04-01', to: '2028-04-01' },
    rows: [
      {
        id: 'fictional',
        cells: ['Fictional plan', 'Hosting', '-9007199254740993'],
      },
    ],
    totals: ['', '', '-9007199254740993'],
    pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
  };
  assert.equal(
    operationalReportResponseSchema.parse(value).totals[2],
    '-9007199254740993',
  );
  for (const amount of ['', '1.5', '1e3', '+1', '001', 'NaN'])
    assert.equal(
      operationalReportResponseSchema.safeParse({
        ...value,
        rows: [{ id: 'fictional', cells: ['Plan', 'Hosting', amount] }],
      }).success,
      false,
    );
  assert.equal(
    operationalReportResponseSchema.safeParse({ ...value, totals: [] }).success,
    false,
  );
});
