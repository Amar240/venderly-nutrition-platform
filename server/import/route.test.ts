import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { MAX_IMPORT_BYTES } from "./validate";
import type { AppSession } from "@/server/auth/types";

const getAppSessionMock = vi.fn();
const runImportMock = vi.fn();

vi.mock("@/server/auth/session", () => ({
  getAppSession: getAppSessionMock,
}));

vi.mock("@/server/import/importStudents", () => ({
  runImport: runImportMock,
}));

const staffSession: AppSession = {
  principalType: "staff",
  userId: "u-test",
  role: "SUPER_ADMIN",
  districtId: "d-test",
  schoolIds: [],
};

function requestWithForm(form: FormData): NextRequest {
  return { formData: async () => form } as unknown as NextRequest;
}

describe("admin import route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAppSessionMock.mockResolvedValue(staffSession);
  });

  it("returns 400 when the upload is missing", async () => {
    const { POST } = await import("@/app/api/admin/import/route");
    const res = await POST(requestWithForm(new FormData()));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "no_file" });
    expect(runImportMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the user is not a super admin", async () => {
    getAppSessionMock.mockResolvedValue({ ...staffSession, role: "DISTRICT_ADMIN" });
    const { POST } = await import("@/app/api/admin/import/route");
    const form = new FormData();
    form.set("file", new File(["student.studentNumber"], "roster.csv", { type: "text/csv" }));
    const res = await POST(requestWithForm(form));
    expect(res.status).toBe(403);
    expect(runImportMock).not.toHaveBeenCalled();
  });

  it("returns 413 for an oversized file before reading text or running import", async () => {
    const { POST } = await import("@/app/api/admin/import/route");
    const file = new File(["x".repeat(MAX_IMPORT_BYTES + 1)], "large.csv", { type: "text/csv" });
    const textSpy = vi.spyOn(file, "text");
    const form = new FormData();
    form.set("file", file);

    const res = await POST(requestWithForm(form));

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "file_too_large", maxBytes: MAX_IMPORT_BYTES });
    expect(textSpy).not.toHaveBeenCalled();
    expect(runImportMock).not.toHaveBeenCalled();
  });
});
