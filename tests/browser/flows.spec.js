import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext("2d");
      let n = 0;
      const draw = () => {
        ctx.fillStyle = "#284e40";
        ctx.fillRect(0, 0, 640, 360);
        ctx.fillStyle = "#d9eeaa";
        ctx.fillRect((n++ * 8) % 600, 100, 40, 120);
      };
      draw();
      const id = setInterval(draw, 50);
      const stream = canvas.captureStream(20);
      stream
        .getVideoTracks()[0]
        .addEventListener("ended", () => clearInterval(id));
      return stream;
    };
  });
});
test("signup, preview, recording, archive and local persistence", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Make your journey count." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Good to see you again." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore local preview" }).click();
  await expect(
    page.getByRole("heading", { name: "Better roads start with you." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Record a road clip" }).click();
  await page.getByRole("button", { name: "Enable camera & location" }).click();
  await expect(
    page.getByRole("button", { name: "Start recording" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Start recording" }).click();
  await page.waitForTimeout(2600);
  await page.getByRole("button", { name: "Stop & save" }).click();
  await expect(
    page.getByRole("heading", { name: "Your clip is saved." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review footage" }).click();
  await expect(page.getByText("Road clip 01", { exact: true })).toBeVisible();
  await page.getByRole("checkbox").check();
  await expect(
    page.getByRole("button", { name: "Upload selected (1)" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Upload all", exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Uploads require a configured account" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Explore local preview" }).click();
  await page.getByRole("button", { name: "My footage" }).click();
  await expect(page.getByText("Road clip 01", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Preview Road clip 01", exact: true })
    .click();
  await expect(page.locator("dialog video")).toBeVisible();
  await expect
    .poll(() => page.locator("dialog video").evaluate((v) => v.readyState))
    .toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.screenshot({
    path: "test-results/archive-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

async function openRecorder(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore local preview" }).click();
  await page.getByRole("button", { name: "Record a road clip" }).click();
}

test("camera denial is recoverable and recording stays disabled", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Camera permission denied", "NotAllowedError");
    };
  });
  await openRecorder(page);
  await page.getByRole("button", { name: "Enable camera & location" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Camera permission denied" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start recording" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Enable camera & location" }),
  ).toBeEnabled();
});

test("three minute cap stops recording and offers another clip", async ({
  page,
}) => {
  await openRecorder(page);
  await page.getByRole("button", { name: "Enable camera & location" }).click();
  await expect(
    page.getByRole("button", { name: "Start recording" }),
  ).toBeEnabled();
  await page.clock.install();
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByRole("button", { name: "Stop & save" })).toBeVisible();
  await page.waitForTimeout(2300);
  await page.screenshot({
    path: "test-results/recorder-desktop.png",
    fullPage: true,
  });
  await page.clock.runFor(181000);
  await expect(
    page.getByRole("heading", { name: "Your clip is saved." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record another clip" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review footage" }).click();
  await expect(page.locator(".clip-thumbnail")).toContainText("03:00");
});
test("mobile dashboard fits viewport and recording opens immediately", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.screenshot({
    path: "test-results/auth-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Explore local preview" }).click();
  await expect(
    page.getByRole("heading", { name: "Better roads start with you." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Record a clip", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "A short clip. A step forward." }),
  ).toBeVisible();
});


test('mobile profile edits name, saves preferences and logs out', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await page.goto('/');
  await page.getByRole('button', {name:'Explore local preview'}).click();
  await page.getByRole('button', {name:'Profile', exact:true}).click();
  await expect(page.getByRole('heading', {name:'My profile.'})).toBeVisible();
  await page.getByRole('button', {name:'Edit profile'}).click();
  await page.getByLabel('Display name').fill('Road Contributor');
  await page.getByRole('button', {name:'Save changes'}).click();
  await expect(page.getByRole('heading', {name:'Road Contributor'})).toBeVisible();
  await page.getByLabel('Default clip length').selectOption('300');
  expect(await page.evaluate(()=>localStorage.getItem('default-clip-length'))).toBe('300');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/profile-mobile.png',fullPage:true});
  await page.getByRole('button', {name:'Leave preview'}).click();
  await expect(page.getByRole('heading', {name:'Make your journey count.'})).toBeVisible();
});
