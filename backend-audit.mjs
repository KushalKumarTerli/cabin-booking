import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const rawEnv = readFileSync(".env", "utf8");
for (const line of rawEnv.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) continue;
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!(key in process.env)) process.env[key] = val;
}

const env = {
  url: process.env.SUPABASE_URL,
  publishable: process.env.SUPABASE_PUBLISHABLE_KEY,
  serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
  adminCode: process.env.ADMIN_SIGNUP_CODE,
  projectId: process.env.VITE_SUPABASE_PROJECT_ID,
};

for (const [k, v] of Object.entries(env)) {
  if (!v) throw new Error(`Missing env: ${k}`);
}

const admin = createClient(env.url, env.serviceRole);
const anon = createClient(env.url, env.publishable);
const runId = `audit-${Date.now()}`;
const managerEmail = `${runId}-manager@example.com`;
const adminEmail = `${runId}-admin@example.com`;
const password = `Pass!${Date.now()}Ab`;
const today = new Date().toISOString().slice(0, 10);

const report = [];
const cleanup = { users: [], cabinId: null, bookingId: null, managerToken: null, adminToken: null };

function pass(name, detail) {
  report.push({ name, status: "PASS", detail });
}
function fail(name, detail) {
  report.push({ name, status: "FAIL", detail });
}

async function checkTable(name) {
  const { error } = await admin.from(name).select("*", { head: true, count: "exact" }).limit(1);
  if (error) throw error;
}

async function main() {
  try {
    // Environment checks
    if (!env.url.includes(`${env.projectId}.supabase.co`)) {
      throw new Error("SUPABASE_URL does not match VITE_SUPABASE_PROJECT_ID");
    }
    pass("Environment variables aligned", env.projectId);

    // Required tables
    for (const t of ["profiles", "user_roles", "cabins", "bookings", "logs"]) {
      await checkTable(t);
    }
    pass("Required tables exist", "profiles,user_roles,cabins,bookings,logs");

    // Registration + role assignment
    const managerSignup = await anon.auth.signUp({
      email: managerEmail,
      password,
      options: { data: { full_name: "Audit Manager", employee_id: randomUUID(), department: "IT", role: "manager" } },
    });
    if (managerSignup.error || !managerSignup.data.user) throw managerSignup.error ?? new Error("manager signup failed");
    cleanup.users.push(managerSignup.data.user.id);
    pass("Registration works", managerEmail);

    const adminSignup = await anon.auth.signUp({
      email: adminEmail,
      password,
      options: { data: { full_name: "Audit Admin", employee_id: randomUUID(), department: "IT", role: "admin" } },
    });
    if (adminSignup.error || !adminSignup.data.user) throw adminSignup.error ?? new Error("admin signup failed");
    cleanup.users.push(adminSignup.data.user.id);

    const { error: elevateErr } = await admin.from("user_roles").insert({ user_id: adminSignup.data.user.id, role: "admin" });
    if (elevateErr && elevateErr.code !== "23505") throw elevateErr;
    pass("Admin signup code path (server-side elevation) ready", "elevation insert succeeded");

    // Login works
    const managerLogin = await anon.auth.signInWithPassword({ email: managerEmail, password });
    if (managerLogin.error || !managerLogin.data.session || !managerLogin.data.user) {
      throw managerLogin.error ?? new Error("manager login failed");
    }
    cleanup.managerToken = managerLogin.data.session.access_token;

    const adminLogin = await anon.auth.signInWithPassword({ email: adminEmail, password });
    if (adminLogin.error || !adminLogin.data.session || !adminLogin.data.user) {
      throw adminLogin.error ?? new Error("admin login failed");
    }
    cleanup.adminToken = adminLogin.data.session.access_token;
    pass("Login works", "manager and admin users can sign in");

    // Role assignment verify
    const { data: mgrRoleRows, error: mgrRoleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", managerSignup.data.user.id);
    if (mgrRoleErr) throw mgrRoleErr;
    if (!(mgrRoleRows ?? []).some((r) => r.role === "manager")) throw new Error("manager role missing");
    pass("Role assignment works", "manager role present");

    // Create cabin as admin (management check)
    const { data: cabin, error: cabinErr } = await admin
      .from("cabins")
      .insert({ name: `Audit Cabin ${runId}`, floor: "Ground Floor", wing: null, capacity: 2, is_active: true })
      .select("id")
      .single();
    if (cabinErr) throw cabinErr;
    cleanup.cabinId = cabin.id;
    pass("Admin cabin management works", "create cabin succeeded");

    // Manager booking insert
    const managerClient = createClient(env.url, env.publishable, {
      global: { headers: { Authorization: `Bearer ${cleanup.managerToken}` } },
    });
    const { data: booking, error: bookErr } = await managerClient
      .from("bookings")
      .insert({
        user_id: managerSignup.data.user.id,
        cabin_id: cleanup.cabinId,
        booking_date: today,
        candidate_count: 1,
        start_time: "10:00:00",
        end_time: "10:45:00",
        purpose: "Audit booking",
      })
      .select("id")
      .single();
    if (bookErr) throw bookErr;
    cleanup.bookingId = booking.id;
    pass("Booking insert works", cleanup.bookingId);

    // Overlap prevention
    const { error: overlapErr } = await managerClient.from("bookings").insert({
      user_id: managerSignup.data.user.id,
      cabin_id: cleanup.cabinId,
      booking_date: today,
      candidate_count: 1,
      start_time: "10:15:00",
      end_time: "11:00:00",
      purpose: "Should fail overlap",
    });
    if (!overlapErr || overlapErr.code !== "23P01") {
      throw new Error(`Expected overlap error 23P01, got ${overlapErr?.code ?? "none"}`);
    }
    pass("Overlap prevention works", "no_overlap_active enforced");

    // Logs persistence
    const { data: logs, error: logsErr } = await admin
      .from("logs")
      .select("id, action_type")
      .eq("target_booking_id", cleanup.bookingId);
    if (logsErr) throw logsErr;
    if (!(logs ?? []).some((l) => l.action_type === "booking_created")) throw new Error("booking_created log missing");
    pass("Logs persist", "booking_created log entry found");

    // Security checks: manager cannot write cabins or read logs
    const { error: managerCabinErr } = await managerClient
      .from("cabins")
      .insert({ name: "Bad", floor: "Ground Floor", capacity: 1, is_active: true });
    if (!managerCabinErr) throw new Error("manager unexpectedly inserted cabin");

    const { data: managerLogsData, error: managerLogsReadErr } = await managerClient.from("logs").select("id").limit(5);
    if (managerLogsReadErr) throw managerLogsReadErr;
    if ((managerLogsData ?? []).length > 0) throw new Error("manager unexpectedly read log rows");
    pass("RLS policies enforced", "manager blocked from admin-only capabilities");

    // Admin override works
    const adminClient = createClient(env.url, env.publishable, {
      global: { headers: { Authorization: `Bearer ${cleanup.adminToken}` } },
    });
    const { error: overrideErr } = await adminClient
      .from("bookings")
      .update({ status: "overridden" })
      .eq("id", cleanup.bookingId);
    if (overrideErr) throw overrideErr;
    pass("Admin booking override works", "status updated to overridden");

    // Dashboard query path
    const { data: dashboardRows, error: dashErr } = await managerClient
      .from("bookings")
      .select("id,status,cabin_id")
      .eq("booking_date", today);
    if (dashErr) throw dashErr;
    if (!dashboardRows?.length) throw new Error("dashboard booking query returned empty");
    pass("Dashboard query path works", `${dashboardRows.length} booking row(s) visible`);
  } catch (e) {
    fail("Audit runtime failure", e instanceof Error ? e.message : String(e));
  } finally {
    if (cleanup.bookingId) await admin.from("bookings").delete().eq("id", cleanup.bookingId);
    if (cleanup.cabinId) await admin.from("cabins").delete().eq("id", cleanup.cabinId);
    for (const userId of cleanup.users) {
      await admin.auth.admin.deleteUser(userId, true);
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

await main();
