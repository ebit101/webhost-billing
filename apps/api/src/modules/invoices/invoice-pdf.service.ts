import { HttpStatus, Injectable } from '@nestjs/common';
import type { Invoice, SerializedMoney } from '@webhost-billing/shared';
import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';
import { ApplicationException } from '../../common/errors/application.exception';

const moduleRequire = createRequire(__filename);
const fonts = {
  regularLatin: moduleRequire.resolve(
    '@fontsource/noto-sans-bengali/files/noto-sans-bengali-latin-400-normal.woff',
  ),
  boldLatin: moduleRequire.resolve(
    '@fontsource/noto-sans-bengali/files/noto-sans-bengali-latin-700-normal.woff',
  ),
  regularBengali: moduleRequire.resolve(
    '@fontsource/noto-sans-bengali/files/noto-sans-bengali-bengali-400-normal.woff',
  ),
  boldBengali: moduleRequire.resolve(
    '@fontsource/noto-sans-bengali/files/noto-sans-bengali-bengali-700-normal.woff',
  ),
} as const;

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const ITEM_BOTTOM = 748;
const COLORS = {
  ink: '#0f172a',
  muted: '#64748b',
  line: '#cbd5e1',
  soft: '#f1f5f9',
  brand: '#0891b2',
  white: '#ffffff',
} as const;

interface TextRun {
  text: string;
  bengali: boolean;
}

@Injectable()
export class InvoicePdfService {
  async render(invoice: Invoice): Promise<Buffer> {
    if (invoice.status === 'DRAFT') {
      throw new ApplicationException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Issue the invoice before downloading its PDF.',
      });
    }
    return renderInvoicePdf(invoice);
  }

  filename(invoice: Invoice): string {
    const safeNumber = invoice.invoiceNumber.replace(/[^A-Za-z0-9_-]/g, '-');
    return `invoice-${safeNumber}.pdf`;
  }
}

export async function renderInvoicePdf(invoice: Invoice): Promise<Buffer> {
  const document = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    compress: true,
    pdfVersion: '1.7',
    size: 'A4',
    margins: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
    info: {
      Title: `Invoice ${invoice.invoiceNumber}`,
      Author: invoice.businessIdentity.name,
      Subject: `Invoice ${invoice.invoiceNumber} for ${invoice.customerName}`,
      Keywords: 'invoice, web hosting, billing',
      CreationDate: new Date(invoice.createdAt),
      ModDate: new Date(invoice.updatedAt),
    },
  });
  document.registerFont('regular-latin', fonts.regularLatin);
  document.registerFont('bold-latin', fonts.boldLatin);
  document.registerFont('regular-bengali', fonts.regularBengali);
  document.registerFont('bold-bengali', fonts.boldBengali);

  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    document.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });

  addPage(document, invoice, true);
  drawParties(document, invoice);
  drawItems(document, invoice);
  drawTotals(document, invoice);
  drawNotes(document, invoice);
  drawPageFooters(document, invoice);
  document.end();
  return completed;
}

function addPage(
  document: PDFKit.PDFDocument,
  invoice: Invoice,
  first: boolean,
) {
  document.addPage({ size: 'A4', margin: MARGIN });
  if (first) {
    document.rect(0, 0, PAGE_WIDTH, 10).fill(COLORS.brand);
    wrapText(document, invoice.businessIdentity.name, 300, true, 18)
      .slice(0, 2)
      .forEach((line, index) => {
        text(document, line, MARGIN, 38 + index * 21, {
          width: 300,
          size: 18,
          bold: true,
          color: COLORS.ink,
        });
      });
    text(document, 'INVOICE', PAGE_WIDTH - 192, 37, {
      width: 150,
      size: 9,
      bold: true,
      align: 'right',
      color: COLORS.muted,
      characterSpacing: 1.5,
    });
    text(document, invoice.invoiceNumber, PAGE_WIDTH - 242, 54, {
      width: 200,
      size: 18,
      bold: true,
      align: 'right',
      color: COLORS.ink,
    });
    statusPill(document, invoice.status, PAGE_WIDTH - 142, 82);
    document.y = 122;
  } else {
    text(document, invoice.businessIdentity.name, MARGIN, 34, {
      width: 280,
      size: 10,
      bold: true,
      color: COLORS.ink,
    });
    text(document, `Invoice ${invoice.invoiceNumber}`, PAGE_WIDTH - 242, 34, {
      width: 200,
      size: 10,
      bold: true,
      align: 'right',
      color: COLORS.ink,
    });
    document
      .moveTo(MARGIN, 55)
      .lineTo(PAGE_WIDTH - MARGIN, 55)
      .stroke(COLORS.line);
    document.y = 72;
  }
}

function drawParties(document: PDFKit.PDFDocument, invoice: Invoice) {
  const top = document.y;
  sectionLabel(document, 'FROM', MARGIN, top);
  let leftY = top + 18;
  leftY = addressBlock(
    document,
    invoice.businessIdentity.name,
    [
      invoice.businessIdentity.addressLine1,
      invoice.businessIdentity.addressLine2,
      cityLine(invoice.businessIdentity),
      invoice.businessIdentity.countryCode,
      invoice.businessIdentity.email,
      invoice.businessIdentity.phone,
      invoice.businessIdentity.taxIdentifier
        ? `Tax ID: ${invoice.businessIdentity.taxIdentifier}`
        : undefined,
    ],
    MARGIN,
    leftY,
    230,
  );

  const rightX = 310;
  sectionLabel(document, 'BILL TO', rightX, top);
  let rightY = top + 18;
  rightY = addressBlock(
    document,
    invoice.customerName,
    [
      invoice.customerAddress.line1,
      invoice.customerAddress.line2,
      [
        invoice.customerAddress.city,
        invoice.customerAddress.region,
        invoice.customerAddress.postalCode,
      ]
        .filter(Boolean)
        .join(', '),
      invoice.customerAddress.countryCode,
      invoice.customerEmail,
      invoice.taxIdentity
        ? `Tax ID: ${invoice.taxIdentity.taxIdentifier}`
        : undefined,
    ],
    rightX,
    rightY,
    PAGE_WIDTH - MARGIN - rightX,
  );

  const metaY = Math.max(leftY, rightY) + 16;
  document.roundedRect(MARGIN, metaY, CONTENT_WIDTH, 54, 6).fill(COLORS.soft);
  const meta = [
    ['Created', date(invoice.createdAt)],
    ['Issued', date(invoice.issuedAt)],
    ['Due', date(invoice.dueAt)],
    ['Order', invoice.orderNumber ?? '—'],
  ] as const;
  meta.forEach(([label, value], index) => {
    const columnWidth = CONTENT_WIDTH / meta.length;
    const x = MARGIN + index * columnWidth + 12;
    sectionLabel(document, label.toUpperCase(), x, metaY + 10);
    text(document, value, x, metaY + 27, {
      width: columnWidth - 24,
      size: 9,
      bold: true,
      color: COLORS.ink,
    });
  });
  document.y = metaY + 76;
}

function drawItems(document: PDFKit.PDFDocument, invoice: Invoice) {
  tableHeader(document);
  invoice.items.forEach((item, index) => {
    const servicePeriod =
      item.servicePeriodStart || item.servicePeriodEnd
        ? `Service period ${date(item.servicePeriodStart)} – ${date(item.servicePeriodEnd)}`
        : null;
    const descriptionLines = wrapText(
      document,
      item.description,
      205,
      false,
      8,
    );
    if (servicePeriod) descriptionLines.push(servicePeriod);
    let position = 0;
    let firstSegment = true;
    while (position < descriptionLines.length) {
      if (document.y > ITEM_BOTTOM - 34) {
        addPage(document, invoice, false);
        tableHeader(document);
      }
      const availableLines = Math.max(
        1,
        Math.floor((ITEM_BOTTOM - document.y - 14) / 11),
      );
      const lines = descriptionLines.slice(position, position + availableLines);
      const rowHeight = Math.max(34, lines.length * 11 + 14);
      if (index % 2 === 1) {
        document
          .rect(MARGIN, document.y, CONTENT_WIDTH, rowHeight)
          .fill('#f8fafc');
      }
      const rowTop = document.y;
      lines.forEach((line, lineIndex) => {
        text(
          document,
          `${firstSegment || lineIndex > 0 ? '' : '(continued) '}${line}`,
          MARGIN + 7,
          rowTop + 7 + lineIndex * 11,
          {
            width: 205,
            size: line === servicePeriod ? 7 : 8,
            color: line === servicePeriod ? COLORS.muted : COLORS.ink,
          },
        );
      });
      if (firstSegment) {
        tableValue(document, String(item.quantity), 253, rowTop, 30);
        tableValue(document, money(item.unitAmount), 286, rowTop, 64);
        tableValue(document, money(item.discountAmount), 353, rowTop, 62);
        tableValue(document, money(item.taxAmount), 418, rowTop, 52);
        tableValue(document, money(item.lineTotal), 473, rowTop, 80, true);
      }
      document
        .moveTo(MARGIN, rowTop + rowHeight)
        .lineTo(PAGE_WIDTH - MARGIN, rowTop + rowHeight)
        .stroke(COLORS.line);
      document.y = rowTop + rowHeight;
      position += lines.length;
      firstSegment = false;
    }
  });
}

function tableHeader(document: PDFKit.PDFDocument) {
  const y = document.y;
  document.roundedRect(MARGIN, y, CONTENT_WIDTH, 28, 4).fill(COLORS.ink);
  const labels = [
    ['DESCRIPTION', MARGIN + 7, 205, 'left'],
    ['QTY', 253, 30, 'right'],
    ['UNIT', 286, 64, 'right'],
    ['DISCOUNT', 353, 62, 'right'],
    ['TAX', 418, 52, 'right'],
    ['TOTAL', 473, 80, 'right'],
  ] as const;
  labels.forEach(([label, x, width, align]) =>
    text(document, label, x, y + 9, {
      width,
      size: 6.5,
      bold: true,
      align,
      color: COLORS.white,
      characterSpacing: 0.6,
    }),
  );
  document.y = y + 28;
}

function tableValue(
  document: PDFKit.PDFDocument,
  value: string,
  x: number,
  y: number,
  width: number,
  bold = false,
) {
  text(document, value, x, y + 10, {
    width,
    size: 7.2,
    bold,
    align: 'right',
    color: COLORS.ink,
  });
}

function drawTotals(document: PDFKit.PDFDocument, invoice: Invoice) {
  if (document.y > 610) {
    addPage(document, invoice, false);
  } else {
    document.y += 18;
  }
  const x = 320;
  const width = PAGE_WIDTH - MARGIN - x;
  const rows: Array<[string, SerializedMoney, boolean, boolean]> = [
    ['Subtotal', invoice.subtotal, false, false],
    ['Discount', invoice.discountTotal, true, false],
    ['Tax', invoice.taxTotal, false, false],
    ['Invoice total', invoice.total, false, true],
    ['Credit', invoice.creditTotal, true, false],
    ['Paid', invoice.amountPaid, true, false],
  ];
  rows.forEach(([label, value, subtract, bold]) => {
    const y = document.y;
    text(document, label, x, y, {
      width: 90,
      size: 8.5,
      bold,
      color: COLORS.muted,
    });
    text(
      document,
      `${subtract && value.amount !== '0' ? '−' : ''}${money(value)}`,
      x + 92,
      y,
      { width: width - 92, size: 8.5, bold, align: 'right', color: COLORS.ink },
    );
    document.y = y + 19;
  });
  document
    .moveTo(x, document.y + 1)
    .lineTo(PAGE_WIDTH - MARGIN, document.y + 1)
    .lineWidth(1.5)
    .stroke(COLORS.ink);
  document.y += 10;
  const balanceY = document.y;
  text(document, 'BALANCE DUE', x, balanceY, {
    width: 100,
    size: 10,
    bold: true,
    color: COLORS.ink,
  });
  text(document, money(invoice.balanceDue), x + 102, balanceY - 1, {
    width: width - 102,
    size: 12,
    bold: true,
    align: 'right',
    color: COLORS.brand,
  });
  document.y = balanceY + 30;
}

function drawNotes(document: PDFKit.PDFDocument, invoice: Invoice) {
  if (document.y > 720) addPage(document, invoice, false);
  const y = Math.max(document.y + 16, 680);
  sectionLabel(document, 'PAYMENT STATUS', MARGIN, y);
  text(document, statusLabel(invoice.status), MARGIN, y + 17, {
    width: 230,
    size: 9,
    bold: true,
    color: COLORS.ink,
  });
  text(
    document,
    invoice.balanceDue.amount === '0'
      ? 'No outstanding balance is recorded on this invoice.'
      : `Outstanding balance: ${money(invoice.balanceDue)}.`,
    MARGIN,
    y + 34,
    { width: 280, size: 8, color: COLORS.muted },
  );
}

function drawPageFooters(document: PDFKit.PDFDocument, invoice: Invoice) {
  const range = document.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page += 1) {
    document.switchToPage(page);
    document
      .moveTo(MARGIN, PAGE_HEIGHT - 64)
      .lineTo(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 64)
      .lineWidth(0.5)
      .stroke(COLORS.line);
    text(
      document,
      `${invoice.invoiceNumber} · ${invoice.currency}`,
      MARGIN,
      PAGE_HEIGHT - 53,
      { width: 250, size: 7, color: COLORS.muted },
    );
    text(
      document,
      `Page ${page - range.start + 1} of ${range.count}`,
      PAGE_WIDTH - 192,
      PAGE_HEIGHT - 53,
      { width: 150, size: 7, align: 'right', color: COLORS.muted },
    );
  }
}

function addressBlock(
  document: PDFKit.PDFDocument,
  heading: string,
  lines: Array<string | null | undefined>,
  x: number,
  y: number,
  width: number,
): number {
  const headingLines = wrapText(document, heading, width, true, 10.5);
  headingLines.forEach((line, index) => {
    text(document, line, x, y + index * 14, {
      width,
      size: 10.5,
      bold: true,
      color: COLORS.ink,
    });
  });
  let cursor = y + headingLines.length * 14 + 4;
  lines
    .filter((line): line is string => Boolean(line))
    .forEach((line) => {
      wrapText(document, line, width, false, 8).forEach((wrappedLine) => {
        text(document, wrappedLine, x, cursor, {
          width,
          size: 8,
          color: COLORS.muted,
        });
        cursor += 13;
      });
    });
  return cursor;
}

function sectionLabel(
  document: PDFKit.PDFDocument,
  value: string,
  x: number,
  y: number,
) {
  text(document, value, x, y, {
    width: 160,
    size: 6.5,
    bold: true,
    color: COLORS.muted,
    characterSpacing: 1,
  });
}

function statusPill(
  document: PDFKit.PDFDocument,
  status: Invoice['status'],
  x: number,
  y: number,
) {
  const value = statusLabel(status);
  document
    .roundedRect(x, y, 100, 20, 10)
    .fill(
      status === 'PAID'
        ? '#dcfce7'
        : status === 'CANCELLED'
          ? '#fee2e2'
          : '#fef3c7',
    );
  text(document, value, x, y + 6, {
    width: 100,
    size: 7,
    bold: true,
    align: 'center',
    color: COLORS.ink,
  });
}

function text(
  document: PDFKit.PDFDocument,
  value: string,
  x: number,
  y: number,
  options: {
    width: number;
    size: number;
    bold?: boolean;
    align?: 'left' | 'right' | 'center';
    color?: string;
    characterSpacing?: number;
  },
) {
  const runs = splitRuns(value);
  const base = {
    width: options.width,
    align: options.align ?? 'left',
    lineBreak: false,
    characterSpacing: options.characterSpacing ?? 0,
  } as const;
  document.fontSize(options.size).fillColor(options.color ?? COLORS.ink);
  if (runs.length === 1 || base.align !== 'left') {
    document
      .font(
        fontName(
          runs.some((run) => run.bengali),
          Boolean(options.bold),
        ),
      )
      .text(value, x, y, base);
    return;
  }
  runs.forEach((run, index) => {
    document.font(fontName(run.bengali, Boolean(options.bold)));
    if (index === 0) {
      document.text(run.text, x, y, { ...base, continued: true });
    } else {
      document.text(run.text, { continued: index < runs.length - 1 });
    }
  });
}

function wrapText(
  document: PDFKit.PDFDocument,
  value: string,
  width: number,
  bold: boolean,
  size: number,
): string[] {
  const lines: string[] = [];
  const paragraphs = value.replaceAll('\r\n', '\n').split('\n');
  document.fontSize(size);
  paragraphs.forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = '';
    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (richWidth(document, candidate, bold) <= width) {
        current = candidate;
        return;
      }
      if (current) lines.push(current);
      if (richWidth(document, word, bold) <= width) {
        current = word;
        return;
      }
      let fragment = '';
      for (const character of Array.from(word)) {
        if (
          fragment &&
          richWidth(document, fragment + character, bold) > width
        ) {
          lines.push(fragment);
          fragment = character;
        } else {
          fragment += character;
        }
      }
      current = fragment;
    });
    if (current) lines.push(current);
    if (!words.length) lines.push('');
  });
  return lines.length ? lines : [''];
}

function richWidth(document: PDFKit.PDFDocument, value: string, bold: boolean) {
  return splitRuns(value).reduce((width, run) => {
    document.font(fontName(run.bengali, bold));
    return width + document.widthOfString(run.text);
  }, 0);
}

function splitRuns(value: string): TextRun[] {
  const runs: TextRun[] = [];
  for (const character of Array.from(value)) {
    const bengali = /[\u0980-\u09ff]/.test(character);
    const last = runs.at(-1);
    if (last?.bengali === bengali) last.text += character;
    else runs.push({ text: character, bengali });
  }
  return runs.length ? runs : [{ text: '', bengali: false }];
}

function fontName(bengali: boolean, bold: boolean): string {
  if (bengali) return bold ? 'bold-bengali' : 'regular-bengali';
  return bold ? 'bold-latin' : 'regular-latin';
}

function cityLine(identity: Invoice['businessIdentity']): string | undefined {
  const value = [identity.city, identity.region, identity.postalCode]
    .filter(Boolean)
    .join(', ');
  return value || undefined;
}

function date(value: string | null): string {
  return value ? value.slice(0, 10) : '—';
}

function statusLabel(status: Invoice['status']): string {
  return status.replaceAll('_', ' ');
}

function money(value: SerializedMoney): string {
  const amount = BigInt(value.amount);
  const digits =
    value.currency === 'BDT' ? 2 : currencyFractionDigits(value.currency);
  const divisor = 10n ** BigInt(digits);
  const whole = amount / divisor;
  if (digits === 0) return `${value.currency} ${groupDigits(whole.toString())}`;
  const fraction = (amount % divisor).toString().padStart(digits, '0');
  return `${value.currency} ${groupDigits(whole.toString())}.${fraction}`;
}

function currencyFractionDigits(currency: string): number {
  return (
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}

function groupDigits(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
