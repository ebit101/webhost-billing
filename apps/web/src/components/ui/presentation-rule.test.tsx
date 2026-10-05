import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { sentenceCaseLabel } from '@webhost-billing/shared';
import { describe, expect, it } from 'vitest';
import { DataTable } from './data-table';
import { PageHeader } from './page-header';
import { StatusBadge } from './status-badge';

function presentationSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? presentationSources(path)
      : /\.(tsx|css)$/.test(path) && !path.endsWith('.test.tsx')
        ? [path]
        : [];
  });
}

describe('app-wide sentence-case presentation rule', () => {
  it('does not reintroduce forced uppercase styling in any interface source', () => {
    const sources = presentationSources(resolve(process.cwd(), 'src'));
    expect(sources.length).toBeGreaterThan(100);
    for (const path of sources) {
      expect(readFileSync(path, 'utf8'), path).not.toMatch(/\buppercase\b/);
    }
  });

  it('renders sentence-case headings and enum labels without rewriting identifiers or content', () => {
    render(
      <>
        <PageHeader
          eyebrow="Customer portal"
          title="My invoices"
          description="Review your billing records."
        />
        <StatusBadge>{sentenceCaseLabel('AWAITING_PAYMENT')}</StatusBadge>
        <StatusBadge>CUS-001024</StatusBadge>
        <DataTable
          caption="Invoices"
          columns={[
            {
              key: 'number',
              header: 'Invoice number',
              render: (row: { number: string }) => row.number,
            },
          ]}
          rows={[{ number: 'INV-001024' }]}
          rowKey={(row) => row.number}
        />
        <p>BDT 1,470.00</p>
        <p>OWNER ENTERED CONTENT</p>
      </>,
    );
    expect(
      screen.getByText('Customer portal').classList.contains('uppercase'),
    ).toBe(false);
    expect(
      screen
        .getByRole('columnheader', { name: 'Invoice number' })
        .classList.contains('uppercase'),
    ).toBe(false);
    expect(screen.getByText('Awaiting payment')).not.toBeNull();
    expect(screen.getByText('CUS-001024')).not.toBeNull();
    expect(screen.getByText('INV-001024')).not.toBeNull();
    expect(screen.getByText('BDT 1,470.00')).not.toBeNull();
    expect(screen.getByText('OWNER ENTERED CONTENT')).not.toBeNull();
  });
});
