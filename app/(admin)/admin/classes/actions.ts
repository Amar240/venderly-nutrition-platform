"use server";

import { revalidatePath } from "next/cache";
import { getAppSession } from "@/server/auth/session";
import { AuthError } from "@/server/auth/errors";
import {
  assignStudentClassroom,
  ClassroomError,
  createClassroom,
  setClassroomActive,
} from "@/server/classrooms/classrooms";

export interface ClassroomActionState {
  ok: boolean;
  error: string | null;
}

const OK: ClassroomActionState = { ok: true, error: null };
const fail = (error: string): ClassroomActionState => ({ ok: false, error });

function mapError(error: unknown): ClassroomActionState {
  if (error instanceof AuthError) {
    return fail("You don't have access to that school, so choose one assigned to you.");
  }
  if (error instanceof ClassroomError) {
    if (error.code === "DUPLICATE") {
      return fail("That teacher already has a class at this school, so use the existing class.");
    }
    if (error.code === "NOT_FOUND") {
      return fail("That class or student was not found, so refresh the page and try again.");
    }
    return fail("The class details do not look right, so check them and try again.");
  }
  throw error;
}

function refreshClasses() {
  revalidatePath("/admin/classes");
  revalidatePath("/pos/serve", "layout");
}

export async function createClassroomAction(
  _previous: ClassroomActionState,
  formData: FormData,
): Promise<ClassroomActionState> {
  try {
    await createClassroom(await getAppSession(), {
      schoolId: String(formData.get("schoolId") ?? ""),
      teacherName: String(formData.get("teacherName") ?? ""),
      grade: String(formData.get("grade") ?? "") || null,
    });
    refreshClasses();
    return OK;
  } catch (error) {
    return mapError(error);
  }
}

export async function setClassroomActiveAction(
  _previous: ClassroomActionState,
  formData: FormData,
): Promise<ClassroomActionState> {
  try {
    await setClassroomActive(
      await getAppSession(),
      String(formData.get("classroomId") ?? ""),
      formData.get("active") === "true",
    );
    refreshClasses();
    return OK;
  } catch (error) {
    return mapError(error);
  }
}

export async function assignStudentClassroomAction(
  _previous: ClassroomActionState,
  formData: FormData,
): Promise<ClassroomActionState> {
  try {
    const classroomId = String(formData.get("classroomId") ?? "");
    await assignStudentClassroom(await getAppSession(), {
      studentId: String(formData.get("studentId") ?? ""),
      classroomId: classroomId || null,
    });
    refreshClasses();
    return OK;
  } catch (error) {
    return mapError(error);
  }
}
