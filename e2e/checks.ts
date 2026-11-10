import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** No sideways scrolling, and nothing sticking out past the edge of the screen. */
export async function expectHealthyLayout(page: Page) {
  const problems = await page.evaluate(() => {
    const found: string[] = [];
    const width = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > width) {
      found.push(`page scrolls sideways: ${document.documentElement.scrollWidth}px wide in a ${width}px viewport`);
    }
    const describe = (el: Element) =>
      `<${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}> "${(el.textContent ?? '').trim().slice(0, 40)}"`;
    const insideScroller = (el: Element) => {
      for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        const overflow = getComputedStyle(node).overflowX;
        if (overflow === 'auto' || overflow === 'scroll' || overflow === 'hidden') return true;
      }
      return false;
    };
    for (const el of document.body.querySelectorAll('*')) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (getComputedStyle(el).visibility === 'hidden') continue;
      if (rect.right > width + 1 || rect.left < -1) {
        if (insideScroller(el)) continue;
        found.push(`${describe(el)} spans ${Math.round(rect.left)}..${Math.round(rect.right)}px of ${width}px`);
        if (found.length >= 5) break;
      }
    }
    return found;
  });
  expect.soft(problems, 'layout overflow').toEqual([]);
}

/** Every control a finger must hit is at least 44px tall. Links inside a sentence are exempt. */
export async function expectTapTargets(page: Page) {
  const small = await page.evaluate(() => {
    const found: string[] = [];
    const controls = document.querySelectorAll(
      'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=checkbox], [role=switch]',
    );
    for (const el of controls) {
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      if (el.tagName === 'A' && style.display === 'inline') continue;
      let target: Element = el;
      // A checkbox or radio is hit through its label, so measure that.
      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
        target = el.closest('label') ?? (el.id ? document.querySelector(`label[for="${el.id}"]`) : null) ?? el;
      }
      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.height < 44 || rect.width < 44) {
        found.push(
          `<${el.tagName.toLowerCase()}> "${(el.textContent ?? '').trim().slice(0, 40) || el.getAttribute('aria-label') || el.getAttribute('name') || ''}" is ${Math.round(rect.width)}x${Math.round(rect.height)}px`,
        );
      }
    }
    return found;
  });
  expect.soft(small, 'tap targets under 44px').toEqual([]);
}

/** iOS Safari zooms the page when a focused input has text smaller than 16px. */
export async function expectReadableInputs(page: Page) {
  const small = await page.evaluate(() => {
    const found: string[] = [];
    for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
      const style = getComputedStyle(el);
      if (style.display === 'none') continue;
      if (el instanceof HTMLInputElement && ['checkbox', 'radio', 'range'].includes(el.type)) continue;
      const size = parseFloat(style.fontSize);
      if (size < 16) found.push(`<${el.tagName.toLowerCase()} name="${el.getAttribute('name') ?? ''}"> has ${size}px text`);
    }
    return found;
  });
  expect.soft(small, 'inputs with text under 16px').toEqual([]);
}

export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join('; ')})`);
  expect.soft(serious, 'accessibility violations').toEqual([]);
}

/**
 * Records console errors and failed requests from the moment it is called.
 * A signed-out visitor's check of /api/auth/me answers 401 by design.
 */
export function watchForErrors(page: Page, allowed: { status: number; path: string }[] = []) {
  const problems: string[] = [];
  const expected = (url: string, status?: number) =>
    (url.endsWith('/api/auth/me') && status === 401) || allowed.some((a) => a.status === status && url.includes(a.path));
  let expected401 = 0;
  page.on('response', (res) => {
    if (res.status() < 400) return;
    if (expected(res.url(), res.status())) expected401++;
    else problems.push(`${res.status()} ${res.request().method()} ${new URL(res.url()).pathname}`);
  });
  page.on('requestfailed', (req) => {
    const reason = req.failure()?.errorText ?? '';
    if (reason.includes('ERR_ABORTED')) return;
    problems.push(`failed ${req.method()} ${new URL(req.url()).pathname}: ${reason}`);
  });
  page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // The browser logs one line per failed request; those are judged above.
    if (text.startsWith('Failed to load resource')) return;
    problems.push(`console: ${text}`);
  });
  return {
    expectNone: () => {
      void expected401;
      expect.soft(problems, 'console errors and failed requests').toEqual([]);
    },
  };
}
