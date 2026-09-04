import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient, type Role } from "@prisma/client";
import { authenticator } from "otplib";
import path from "node:path";

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Demo!Pass1";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function staffTotp(role: Role) {
  const user = await prisma.user.findFirstOrThrow({ where: { role, disabledAt: null }, select: { totpSecret: true } });
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

test("demo evaluator credentials are consolidated to four active logins", async ({ page }) => {
  const [legacyStaff, mergedStaff, schoolCount] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { email: "staff@nutrition.demo" },
      include: { schools: { select: { schoolId: true } } },
    }),
    prisma.user.findUniqueOrThrow({
      where: { email: "districtadmin@nutrition.demo" },
      include: { schools: { select: { schoolId: true } } },
    }),
    prisma.school.count(),
  ]);

  expect(legacyStaff.role).toBe("SCHOOL_STAFF");
  expect(legacyStaff.disabledAt).not.toBeNull();
  expect(legacyStaff.schools).toHaveLength(1);

  expect(mergedStaff.role).toBe("DISTRICT_ADMIN");
  expect(mergedStaff.disabledAt).toBeNull();
  expect(mergedStaff.schools).toHaveLength(schoolCount);

  const audit = await prisma.auditLog.findFirst({
    where: {
      action: "CONFIG_USER_DEACTIVATE",
      subjectId: legacyStaff.id,
    },
  });
  expect(audit).not.toBeNull();

  await page.goto("/signin");
  await page.getByLabel("Email").fill(legacyStaff.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByLabel("Authenticator code").fill(authenticator.generate(legacyStaff.totpSecret!));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That password doesn't match. Try again, or reset it.")).toBeVisible();
  await expect(page).toHaveURL(/\/signin/);

  await signIn(page, mergedStaff.email, /\/admin/, authenticator.generate(mergedStaff.totpSecret!));
});

function dateOnlyInZone(timeZone: string, now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(value("year"), value("month") - 1, value("day")));
}

test("guardian phone flow has banner, skip link, accessible states, deposit, and sibling transfer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "guardian@nutrition.demo", /\/guardian/);
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
  await page.getByRole("button", { name: "Add $10.00" }).click();
  await expect(page.getByRole("button", { name: /Pay \$10\.00/ })).toBeVisible();

  await page.goto("/guardian/transfer");
  await page.getByLabel("From").selectOption({ label: "Ella Whitfield" });
  await page.getByLabel("To").selectOption({ label: "Marcus Okafor" });
  await page.getByLabel("Amount").fill("5.00");
  await page.getByRole("button", { name: "Review $5.00" }).click();
  await page.getByRole("button", { name: "Move money" }).click();
  await expect(page.getByText("Money moved.")).toBeVisible();
});

test("POS tablet flow is keyboard operable, announces result, and keeps 48px targets", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await signIn(page, "cashier@nutrition.demo", /\/pos/, await staffTotp("CASHIER"));
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
  await expect(page.getByRole("status")).toContainText("Lunch undone for Nora Bell.");
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

test("POS roster mode records and undoes one teacher class as an atomic batch", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await signIn(page, "cashier@nutrition.demo", /\/pos/, await staffTotp("CASHIER"));
  await page.getByRole("link", { name: "Lunch" }).click();
  await page.getByRole("link", { name: "Choose a class" }).click();
  await page.getByRole("link", { name: /Priya Shah/ }).click();

  await expect(page.getByText("Ella W.")).toBeVisible();
  await expect(page.getByText("already recorded", { exact: true })).toBeVisible();
  const mia = page.getByRole("button", { name: "Mia O." });
  await mia.focus();
  await page.keyboard.press("Space");
  await expect(mia).toHaveAttribute("aria-pressed", "true");
  await expect(mia.locator("svg")).toBeVisible();
  await expect(page.getByText("1 selected · 8 not eating · 1 already done")).toBeVisible();

  await page.getByRole("button", { name: "Record 1 lunch." }).click();
  await expect(page.locator(".sr-only[aria-live='polite']")).toHaveText("1 lunch recorded.");
  const undo = page.getByRole("button", { name: "Undo 1 lunch" });
  await expect(undo).toBeVisible();
  await expect(undo).toBeFocused();
  await undo.press("Enter");
  await expect(page.locator(".sr-only[aria-live='polite']")).toHaveText("1 lunch undone.");
  await expect(page.getByRole("heading", { name: "Priya Shah" })).toBeFocused();

  await expectNoHorizontalOverflow(page);
  await expectTargetsAtLeast(page, "a,button,input,select", 48);
  await expectAxeClean(page);
});

test("admin laptop flow covers search, correction, export error surface, and import", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const scopeNorth = await prisma.school.findFirstOrThrow({
    where: { code: "0781" },
    select: {
      id: true,
      district: { select: { timeZone: true } },
      students: {
        where: { enrollmentStatus: "ACTIVE" },
        select: { id: true },
        orderBy: { studentNumber: "asc" },
      },
    },
  });
  await prisma.mealEvent.createMany({
    data: scopeNorth.students.map((student) => ({
      studentId: student.id,
      schoolId: scopeNorth.id,
      serviceDate: dateOnlyInZone(scopeNorth.district.timeZone),
      mealType: "BREAKFAST" as const,
      priceCents: 0,
    })),
  });

  await signIn(page, "superadmin@nutrition.demo", /\/admin/, await staffTotp("SUPER_ADMIN"));
  await expect(page.getByRole("heading", { name: "Breakfast counts need attention" })).toBeVisible();
  await expect(page.getByText("Breakfast counts look high at Demo Learning Center North. Today recorded 2 breakfasts. The most you'd expect for today is 1.")).toBeVisible();
  await page.getByRole("link", { name: "Check today's figures" }).click();
  await expect(page.getByRole("heading", { name: "Check meal-count ceilings" })).toBeVisible();
  await expect(page.getByText("Ceilings use the 93.8% FNS federal default and are rounded down to a whole meal.")).toBeVisible();
  await expect(page.getByText("These are your figures to check and submit. This system doesn't file claims and isn't your official counting record")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Maximum expected" })).toBeVisible();
  await expect(page.getByText("Needs attention", { exact: true })).toBeVisible();
  await expect(page.getByText(/attendance factor/i)).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await expectAxeClean(page);
  await expectTargetsAtLeast(page, "a,button,input,select", 44);

  await page.goto("/admin/reports/claim-figures?month=2026-08");
  await expect(page.getByRole("heading", { name: "Monthly claim figures" })).toBeVisible();
  await expect(page.getByText("54.82% × 1.6 = 87.7% at the free rate")).toBeVisible();
  await expect(page.getByText("This prototype contains 200 synthetic students, so these totals are not district-scale figures.")).toBeVisible();
  await expect(page.getByText("This system doesn't file claims and isn't your official counting record")).toBeVisible();
  await expect(page.getByText(/Lunch counts look high at Demo Middle School/)).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Extra lunches" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectAxeClean(page);
  await expectTargetsAtLeast(page, "a,button,input,select", 44);

  await page.goto("/admin/students?q=100003");
  await page.getByRole("link", { name: "100003" }).click();
  await expect(page.getByText(/Undone by Casey Nguyen at/)).toBeVisible();
  await page.goto("/admin/students?q=100001");
  await expectNoHorizontalOverflow(page);
  await expectAxeClean(page);
  await page.getByRole("link", { name: "100001" }).click();
  await expect(page.getByText(/Seeded demo correction for an incorrect cash payment/).first()).toBeVisible();
  await expect(page.getByText(/Corrects: Payment/)).toBeVisible();
  await page.getByLabel("Snack was returned").check();
  const returnedSnack = page.getByLabel("Payment or charge");
  const returnedSnackValue = await returnedSnack.locator("option", { hasText: "Cookie return demo A" }).getAttribute("value");
  expect(returnedSnackValue).toBeTruthy();
  await returnedSnack.selectOption(returnedSnackValue!);
  await page.getByLabel("Reason saved with your name").first().fill("Snack returned during demo");
  await page.getByRole("button", { name: "Review what will happen" }).click();
  await expect(page.getByRole("heading", { name: "Here's what will happen" })).toBeVisible();
  await page.getByRole("button", { name: "Give back $1.25" }).click();
  await expect(page.getByText("$1.25 was given back and kept with your name and the reason.")).toBeVisible();

  await page.goto("/admin/reports/export");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download money history" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/money-history-/);

  await page.goto("/admin/import");
  await expectAxeClean(page);
  await page.getByLabel("Student list file").setInputFiles(path.resolve("fixtures/clean.csv"));
  await page.getByRole("button", { name: "Upload student list" }).click();
  await expect(page.getByText("Student list uploaded")).toBeVisible();
  await expect(page.getByText("3 columns were ignored: date of birth, race, and gender. This system doesn't store them.")).toBeVisible();
  await expectTargetsAtLeast(page, "a,button,input,select", 44);

  await page.goto("/admin/classes");
  await page.getByLabel("School").selectOption({ label: "Demo Elementary School" });
  await page.getByRole("button", { name: "Show classes" }).click();
  await expect(page.getByRole("heading", { name: "Classes at Demo Elementary School" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Priya Shah" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectAxeClean(page);
});
