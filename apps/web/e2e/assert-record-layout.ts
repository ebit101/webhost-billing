import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';

/** Only use on fictional record screens; never capture authentication fields. */
export async function expectRecordPageFits(page: Page, label: string) {
  try {
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
  } catch {
    const geometry = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      elements: Array.from(
        document.querySelectorAll(
          'body, main, main > div, main > div > div, aside, dialog, section',
        ),
      )
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            className: element.className,
            width: rect.width,
            right: rect.right,
            scroll: element.scrollWidth,
          };
        })
        .filter(
          (item) =>
            item.width > window.innerWidth ||
            item.scroll > window.innerWidth ||
            (item.tag === 'DIALOG' && item.width > 0),
        ),
    }));
    const output = resolve('../../release-artifacts/command134-record-tables');
    await mkdir(output, { recursive: true });
    await page.screenshot({
      path: resolve(output, label + '-overflow.png'),
      fullPage: true,
      animations: 'disabled',
    });
    throw new Error(
      label + ' exceeds the viewport: ' + JSON.stringify(geometry),
    );
  }
}
