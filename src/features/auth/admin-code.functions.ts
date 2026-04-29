import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const verifyAdminCode = createServerFn({ method: "POST" })
  .inputValidator((input: { code: string }) => z.object({ code: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data }) => {
    const adminCode = process.env.ADMIN_SIGNUP_CODE;
    if (!adminCode) {
      throw new Error("ADMIN_SIGNUP_CODE is not configured.");
    }
    return { valid: data.code === adminCode };
  });

export const elevateUserToAdmin = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { userId: string; code: string }) =>
      z.object({ userId: z.string().uuid(), code: z.string().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    const adminCode = process.env.ADMIN_SIGNUP_CODE;
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!adminCode) throw new Error("ADMIN_SIGNUP_CODE is not configured.");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase service role environment variables are missing.");
    }
    if (data.code !== adminCode) return { valid: false };

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { error } = await admin.from("user_roles").upsert(
      { user_id: data.userId, role: "admin" },
      { onConflict: "user_id,role" },
    );
    if (error) throw new Error(error.message);

    return { valid: true };
  });