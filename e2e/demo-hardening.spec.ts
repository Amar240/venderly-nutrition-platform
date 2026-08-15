import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient, type Role } from "@prisma/client";
import { authenticator } from "otplib";
import path from "node:path";

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Woodbridge!Demo1";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function staffTotp(role: Role) {
  const user = await prisma.user.findFirstOrThrow({ where: { role }, select: { totpSecret: true } });
  return authenticator.generate(user.totpSecret!);
}

async function signIn(page: Page, email: string, expectedPath: RegExp, totp?: string) {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  if (totp) await page.getByLabel("Authenticator code").fill(totp);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(expectedPath);
  await expect(page.getByText("PROTOTYPE")).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
}

async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious).toEqual([]);
}

async function expectTargetsAtLeast(page: Page, selector: string, min: number) {
  const small = await page.locator(selector).evaluateAll((els, minimum) =>
    els
      .filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true")
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          hidden: el instanceof HTMLInputElement && el.type === "hidden",
          text: el.textContent?.trim() ?? el.getAttribute("aria-label") ?? "",
          width: rect.width,
          height: rect.height,
        };
      })
      .filter((rect) => {
        if (rect.hidden) return false;
        if (rect.width === 0 && rect.height === 0) return false;
        return rect.width < minimum || rect.height < minimum;
      }),
    min,
  );
  expect(small).toEqual([]);
}

test("guardian phone flow has banner, skip link, accessible states, deposit, and sibling transfer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "guardian@woodbridge.demo", /\/guardian/);
  await page.getByRole("link", { name: "Skip to main content" }).focus();
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await expectAxeClean(page);
  await expectTargetsAtLeast(page, "a,button,input,select", 44);
  const ellaCard = page.getByLabel("Ella Whitfield", { exact: true });
  const marcusCard = page.getByLabel("Marcus Okafor", { exact: true });
  await expect(ellaCard.getByText("Breakfast recorded today")).toBeVisible();
  await expect(ellaCard.getByText("Lunch recorded today")).toBeVisible();
  await expect(marcusCard.getByText("Breakfast and lunch are free")).toBeVisible();
  await expect(marcusCard.getByText("$9.00 for snacks and extras")).toBeVisible();
  await expect(marcusCard.getByText("No lunch recorded for Marcus on 3 of the last 5 school days.")).toBeVisible();
  await expect(marcusCard.getByText("Lunch is free every day")).toBeVisible();
  await expect(marcusCard.getByText("Marcus will still be served if it runs out.")).toBeVisible();

  await page.getByRole("link", { name: "Add money", exact: true }).click();
  await page.waitForURL(/\/guardian\/deposit/);
  await page.getByLabel("Marcus Okafor", { exact: true }).fill("10.00");
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await expect(page.getByRole("button", { name: /Pay \$10\.00/ })).toBeVisible();

  await page.goto("/guardian/transfer");
  await page.getByLabel("From").selectOption({ label: "Ella Whitfield" });
  await page.getByLabel("To").selectOption({ label: "Marcus Okafor" });
  await page.getByLabel("Amount").fill("5.00");
  await page.getByRole("button", { name: "Review transfer" }).click();
  await page.getByRole("button", { name: "Confirm transfer" }).click();
  await expect(page.getByText("Transfer complete.")).toBeVisible();
});

test("POS tablet flow is keyboard operable, announces result, and keeps 48px targets", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await signIn(page, "cashier@woodbridge.demo", /\/pos/, await staffTotp("CASHIER"));
  await page.getByRole("link", { name: "Lunch" }).click();
  await expectNoHorizontalOverflow(page);
  await expectAxeClean(page);
  await expectTargetsAtLeast(page, "a,button,input,select", 48);

  await page.getByLabel("Student number").fill("100003");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("Meal recorded");
  const undo = page.getByRole("button", { name: "Undo last student" });
  await expect(undo).toBeVisible();
  await undo.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("Lunch entry undone for Nora Bell.");
  await expect(undo).toHaveCount(0);
  await expect(page.getByLabel("Student number")).toBeFocused({ timeout: 4_000 });

  // A reversed normal entry does not block an ordinary re-entry.
  await page.getByLabel("Student number").fill("100003");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("Meal recorded");

  await page.getByLabel("Student number").fill("100001");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("Already had lunch");

  await page.getByLabel("Student number").fill("100002");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("Not at this school");
  await expect(page.getByRole("button", { name: "Undo last student" })).toBeVisible();
});

test("admin laptop flow covers search, correction, export error surface, and import", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "superadmin@woodbridge.demo", /\/admin/, await staffTotp("SUPER_ADMIN"));
  await page.goto("/admin/students?q=100003");
  await page.getByRole("link", { name: "100003" }).click();
  await expect(page.getByText(/Undone by Casey Nguyen at/)).toBeVisible();
  await page.goto("/admin/students?q=100001");
  await expectNoHorizontalOverflow(page);
  await expectAxeClean(page);
  await page.getByRole("link", { name: "100001" }).click();
  await expect(page.getByText("Incorrect synthetic cash deposit")).toBeVisible();
  await page.getByLabel("Amount").first().fill("1.00");
  await page.getByLabel("Reason").first().fill("Verified cash deposit correction");
  await page.getByRole("button", { name: "Apply adjustment" }).click();
  await expect(page.getByText("Done.")).toBeVisible();

  await page.goto("/admin/reports/export");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/transactions-/);

  await page.goto("/admin/import");
  await expectAxeClean(page);
  await page.getByLabel("CSV file").setInputFiles(path.resolve("fixtures/clean.csv"));
  await page.getByRole("button", { name: "Validate & import" }).click();
  await expect(page.getByText("Import complete")).toBeVisible();
  await expect(page.getByText(/ignored by policy/)).toBeVisible();
  await expectTargetsAtLeast(page, "a,button,input,select", 44);
});
