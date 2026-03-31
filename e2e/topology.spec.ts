import { test, expect, Page } from '@playwright/test';

// Helper: navigate to a screen via sidebar button (matches text exactly)
async function navigateTo(page: Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
}

// Helper: create an agent via the Agents screen
async function createAgent(page: Page, name: string) {
  await navigateTo(page, 'Agents');
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'NEW_AGENT', exact: true }).click();
  await page.getByPlaceholder('e.g. VECTOR_SIGMA').fill(name);
  await page.getByRole('button', { name: 'Create Agent', exact: true }).click();
  await page.waitForTimeout(200);
}

test.describe('Topology screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('renders orchestrator node', async ({ page }) => {
    await navigateTo(page, 'Topology');
    await expect(page.getByText('ORCHESTRATOR', { exact: true })).toBeVisible();
  });

  test('shows connection instructions in help bar', async ({ page }) => {
    await navigateTo(page, 'Topology');
    await expect(page.getByText(/conectar agentes/i)).toBeVisible();
  });

  test('shows zoom controls', async ({ page }) => {
    await navigateTo(page, 'Topology');
    await expect(page.getByTitle('Zoom In (+)')).toBeVisible();
    await expect(page.getByTitle('Zoom Out (-)')).toBeVisible();
    await expect(page.getByTitle('Reset View')).toBeVisible();
  });

  test('can create a new cluster', async ({ page }) => {
    await navigateTo(page, 'Topology');
    await page.getByRole('button', { name: /NEW CLUSTER/i }).click();
    await page.getByPlaceholder('e.g. DATA_PROCESSING').fill('TESTCLUSTER');
    await page.getByRole('button', { name: 'CREATE', exact: true }).click();
    // The cluster node should appear in the canvas
    await expect(page.locator('[data-topology]').or(
      page.getByRole('paragraph').filter({ hasText: /^TESTCLUSTER$/ })
    )).toBeVisible();
  });

  test('agent nodes appear in topology after creation', async ({ page }) => {
    await createAgent(page, 'ALPHA');
    await createAgent(page, 'BETA');
    await navigateTo(page, 'Topology');
    await page.waitForTimeout(500);
    // Agent names are uppercased and truncated in topology
    await expect(page.locator('[data-agent-id]').first()).toBeVisible();
    const count = await page.locator('[data-agent-id]').count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('connection handle is visible on agent hover', async ({ page }) => {
    await createAgent(page, 'HOVERBOT');
    await navigateTo(page, 'Topology');
    await page.waitForTimeout(500);

    const agentNode = page.locator('[data-agent-id]').first();
    await expect(agentNode).toBeVisible();
    await agentNode.hover();

    // The connection handle has cursor-crosshair class
    const handle = agentNode.locator('.cursor-crosshair');
    await expect(handle).toBeVisible();
  });

  test('drag-to-connect creates a bezier path between two agents', async ({ page }) => {
    await createAgent(page, 'SOURCEBOT');
    await createAgent(page, 'TARGETBOT');
    await navigateTo(page, 'Topology');
    await page.waitForTimeout(600);

    const nodes = page.locator('[data-agent-id]');
    expect(await nodes.count()).toBeGreaterThanOrEqual(2);

    const sourceBox = await nodes.nth(0).boundingBox();
    const targetBox = await nodes.nth(1).boundingBox();
    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();

    // Connection handle sits at the right edge of the node
    const handleX = sourceBox!.x + sourceBox!.width - 4;
    const handleY = sourceBox!.y + sourceBox!.height / 2;
    const targetCX = targetBox!.x + targetBox!.width / 2;
    const targetCY = targetBox!.y + targetBox!.height / 2;

    await page.mouse.move(handleX, handleY);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(
        handleX + (targetCX - handleX) * (i / 12),
        handleY + (targetCY - handleY) * (i / 12),
      );
    }
    await page.mouse.up();
    await page.waitForTimeout(300);

    // A connection SVG path should now be rendered (stroke-opacity 0.85 = real connection)
    const conn = page.locator('svg path[stroke="#97a9ff"][stroke-opacity="0.85"]');
    await expect(conn).toBeVisible();
  });

  test('connection banner appears while dragging from handle', async ({ page }) => {
    await createAgent(page, 'DRAGBOT');
    await navigateTo(page, 'Topology');
    await page.waitForTimeout(500);

    const agentNode = page.locator('[data-agent-id]').first();
    const box = await agentNode.boundingBox();
    expect(box).not.toBeNull();

    const handleX = box!.x + box!.width - 4;
    const handleY = box!.y + box!.height / 2;

    await page.mouse.move(handleX, handleY);
    await page.mouse.down();
    await page.mouse.move(handleX + 60, handleY + 20);

    await expect(page.getByText(/suelta sobre un agente para conectar/i)).toBeVisible();

    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.getByText(/suelta sobre un agente para conectar/i)).not.toBeVisible();
  });

  test('duplicate connections are rejected', async ({ page }) => {
    await createAgent(page, 'DUPSRC');
    await createAgent(page, 'DUPTGT');
    await navigateTo(page, 'Topology');
    await page.waitForTimeout(600);

    const nodes = page.locator('[data-agent-id]');
    const srcBox = await nodes.nth(0).boundingBox();
    const tgtBox = await nodes.nth(1).boundingBox();
    expect(srcBox).not.toBeNull();
    expect(tgtBox).not.toBeNull();

    const handleX = srcBox!.x + srcBox!.width - 4;
    const handleY = srcBox!.y + srcBox!.height / 2;
    const tgtCX = tgtBox!.x + tgtBox!.width / 2;
    const tgtCY = tgtBox!.y + tgtBox!.height / 2;

    const drag = async () => {
      await page.mouse.move(handleX, handleY);
      await page.mouse.down();
      await page.mouse.move(tgtCX, tgtCY, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(300);
    };

    await drag();
    const countAfterFirst = await page.locator('svg path[stroke="#97a9ff"][stroke-opacity="0.85"]').count();

    await drag();
    const countAfterSecond = await page.locator('svg path[stroke="#97a9ff"][stroke-opacity="0.85"]').count();

    expect(countAfterSecond).toBe(countAfterFirst);
  });

  test('self-connection is prevented', async ({ page }) => {
    await createAgent(page, 'SELFBOT');
    await navigateTo(page, 'Topology');
    await page.waitForTimeout(500);

    const agentNode = page.locator('[data-agent-id]').first();
    const box = await agentNode.boundingBox();
    expect(box).not.toBeNull();

    const handleX = box!.x + box!.width - 4;
    const handleY = box!.y + box!.height / 2;
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    await page.mouse.move(handleX, handleY);
    await page.mouse.down();
    await page.mouse.move(cx, cy, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const count = await page.locator('svg path[stroke="#97a9ff"][stroke-opacity="0.85"]').count();
    expect(count).toBe(0);
  });

  test('zoom in and out works', async ({ page }) => {
    await navigateTo(page, 'Topology');
    // The header zoom display (span in the controls area)
    const zoomDisplay = page.locator('span.font-mono.text-on-surface-variant.w-10');
    await expect(zoomDisplay).toHaveText('100%');

    await page.getByTitle('Zoom In (+)').click();
    await expect(zoomDisplay).toHaveText('125%');

    await page.getByTitle('Zoom Out (-)').click();
    await expect(zoomDisplay).toHaveText('100%');

    // Zoom out below 100%
    await page.getByTitle('Zoom Out (-)').click();
    await expect(zoomDisplay).toHaveText('75%');

    await page.getByTitle('Reset View').click();
    await expect(zoomDisplay).toHaveText('100%');
  });
});
