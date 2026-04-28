import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ADMIN_CODE = "TRAINADMIN2026";

export const verifyAdminCode = createServerFn({ method: "POST" })
  .inputValidator((input: { code: string }) => z.object({ code: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data }) => {
    return { valid: data.code === ADMIN_CODE };
  });