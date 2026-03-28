"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  COOKIE_NAME,
  SESSION_DURATION_DAYS,
  signSession,
  verifyPassword,
} from "@/lib/auth";
import type { ActionResult } from "@/types";

const LoginSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export async function login(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = LoginSchema.safeParse({
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: "Invalid input",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) {
    return { success: false, error: "Server not configured" };
  }

  // Support both plain text (dev) and bcrypt hash
  let valid = false;
  if (appPassword.startsWith("$2")) {
    valid = await verifyPassword(parsed.data.password, appPassword);
  } else {
    valid = parsed.data.password === appPassword;
  }

  if (!valid) {
    return { success: false, error: "Invalid password" };
  }

  const token = await signSession();
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * SESSION_DURATION_DAYS,
    path: "/",
  });

  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  redirect("/login");
}
