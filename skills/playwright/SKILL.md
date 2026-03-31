---
name: playwright
description: Write and run Playwright E2E tests for web and Electron apps. Use when the user wants to write automated browser tests, test UI interactions, assert page state, take screenshots, or run end-to-end test suites. Triggers on "playwright test", "E2E test", "automate browser", "test this page", or any UI automation task.
---

## Setup

```bash
# Install Playwright and browsers
npm install --save-dev @playwright/test
npx playwright install

# For Electron apps
npm install --save-dev playwright
```

## Basic Test Structure

```typescript
import { test, expect } from '@playwright/test';

test('page loads', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await expect(page).toHaveTitle(/CodeOrchester/);
});
```

## Electron-Specific Testing

```typescript
import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';

test('Electron app launches', async () => {
  const app = await electron.launch({ args: ['dist-electron/main.js'] });
  const window = await app.firstWindow();
  await expect(window).toHaveTitle(/CodeOrchester/);
  await app.close();
});

test('navigate via sidebar', async () => {
  const app = await electron.launch({ args: ['dist-electron/main.js'] });
  const page = await app.firstWindow();
  await page.getByRole('button', { name: /topology/i }).click();
  await expect(page.locator('text=ORCHESTRATOR')).toBeVisible();
  await app.close();
});
```

## Selectors (prefer in this order)

```typescript
page.getByRole('button', { name: 'Submit' })   // best
page.getByText('Exact text')                    // good for labels
page.getByTestId('my-id')                       // requires data-testid
page.locator('.css-class')                      // last resort
```

## Assertions

```typescript
await expect(locator).toBeVisible();
await expect(locator).toHaveText('expected');
await expect(locator).toHaveCount(3);
await expect(page).toHaveURL(/dashboard/);
await expect(page).toHaveScreenshot('baseline.png');
```

## playwright.config.ts

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

## Running Tests

```bash
npx playwright test                              # run all
npx playwright test e2e/topology.spec.ts        # run specific file
npx playwright test --headed                    # see the browser
npx playwright test --debug                     # interactive debug
npx playwright codegen http://localhost:5173    # record interactions
npx playwright show-report                      # view HTML report
```

## Best Practices

- Use `data-testid` attributes on key UI elements for stable selectors
- Isolate tests — each test should set up its own state
- Use `beforeEach` to navigate to a known starting page
- Prefer `getByRole` over CSS selectors for accessibility alignment
- Use `waitFor` or built-in auto-waiting instead of manual `sleep`
- Run `npx playwright test --update-snapshots` to refresh visual baselines
