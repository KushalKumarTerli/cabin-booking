import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useNotification } from "@/hooks/use-notification";
import { Loader2, CheckCircle2, Pencil, X, AlertCircle, Clock } from "lucide-react";
import {
  todayISO,
  tomorrowISO,
  computeEndTime,
  formatTime12h,
  formatDuration,
  timeToMinutes,
  WORKING_START,
  WORKING_END_EXTENDED,
  overlapsLunch,
  getSuggestedSlotAroundLunch,
  nowRoundedTo15,
  SLOT_MINUTES,
  DEPARTMENTS,
  LUNCH_START,
  LUNCH_END,
  hasManagerConflict,
} from "@/lib/booking-utils";
import { TimePicker } from "@/components/ui/time-picker";

const searchSchema = z.object({
  cabinId: z.string().optional(),
  date: z.string().optional(),
  start: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/book")({
  validateSearch: searchSchema,
  component: BookPage,
});

interface CabinRow { id: string; name: string; floor: string; wing: string | null; }
interface BookingRow { cabin_id: string; user_id: string; start_time: string; end_time: string; status: string; }

function BookPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const notify = useNotification();

  const [date, setDate] = useState<"today" | "tomorrow">(
    search.date === tomorrowISO() ? "tomorrow" : "today",
  );
  const dateStr = date === "today" ? todayISO() : tomorrowISO();

  const [candidates, setCandidates] = useState(1);
  const [candidateRaw, setCandidateRaw] = useState("1");
  const [startTime, setStartTime] = useState<string>(() => {
    if (search.start) return search.start.length === 5 ? `${search.start}:00` : search.start;
    return date === "today" ? nowRoundedTo15() : "09:00:00";
  });
  const [manualEndTime, setManualEndTime] = useState<string | null>(null);
  const [cabinId, setCabinId] = useState<string>(search.cabinId ?? "");
  const [purpose, setPurpose] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Editable profile overrides (local display only)
  const [editField, setEditField] = useState<"name" | "employeeId" | "department" | null>(null);
  const [overrideName, setOverrideName] = useState("");
  const [overrideEmployeeId, setOverrideEmployeeId] = useState("");
  const [overrideDepartment, setOverrideDepartment] = useState("");

  useEffect(() => {
    if (profile) {
      setOverrideName(profile.full_name);
      setOverrideEmployeeId(profile.employee_id);
      setOverrideDepartment(profile.department);
    }
  }, [profile]);

  const cabinsQ = useQuery({
    queryKey: ["cabins", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cabins")
        .select("id, name, floor, wing")
        .eq("is_active", true)
        .order("floor")
        .order("name");
      if (error) throw error;
      return data as CabinRow[];
    },
    staleTime: 30_000,
  });

  const bookingsQ = useQuery({
    queryKey: ["bookings", "by-date", dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("cabin_id, user_id, start_time, end_time, status")
        .eq("booking_date", dateStr)
        .eq("status", "active");
      if (error) throw error;
      return data as BookingRow[];
    },
    staleTime: 0,
    refetchInterval: 15_000,
    refetchOnMount: "always",
  });

  const autoEndTime = useMemo(() => computeEndTime(startTime, candidates), [startTime, candidates]);
  const endTime = manualEndTime ?? autoEndTime;
  const endMin = timeToMinutes(endTime);
  const fitsDay = endMin <= timeToMinutes(WORKING_END_EXTENDED);

  // Max candidates that fit within the extended workday from start time
  const maxCandidates = Math.max(1, Math.floor(
    (timeToMinutes(WORKING_END_EXTENDED) - timeToMinutes(startTime)) / SLOT_MINUTES,
  ));

  // Reset manual end when start or candidates change
  useEffect(() => { setManualEndTime(null); }, [startTime, candidates]);

  // Clamp candidates when start time changes
  useEffect(() => {
    if (candidates > maxCandidates) setCandidates(maxCandidates);
  }, [startTime]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep raw display string in sync when candidates is clamped externally
  useEffect(() => { setCandidateRaw(String(candidates)); }, [candidates]);

  const nowMin = (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); })();
  const validStart = date === "tomorrow" || timeToMinutes(startTime) >= nowMin;
  const lunchOverlap = fitsDay && overlapsLunch(startTime, endTime);
  const lunchSuggestion = lunchOverlap ? getSuggestedSlotAroundLunch(candidates) : null;

  // A manager cannot hold bookings on multiple cabins at the same time
  const managerConflict = useMemo(() => {
    if (!user || !fitsDay) return false;
    const otherCabinBookings = (bookingsQ.data ?? []).filter(
      (b) => b.cabin_id !== cabinId, // exclude the cabin being booked (they wouldn't conflict with themselves)
    );
    return hasManagerConflict(otherCabinBookings, user.id, startTime, endTime);
  }, [bookingsQ.data, user, startTime, endTime, cabinId, fitsDay]);

  const availableCabins = useMemo(() => {
    const cabins = cabinsQ.data ?? [];
    const bks = bookingsQ.data ?? [];
    const reqStart = timeToMinutes(startTime);
    const reqEnd = endMin;
    return cabins.filter((c) => {
      return !bks.filter((b) => b.cabin_id === c.id).some((b) => {
        const s = timeToMinutes(b.start_time);
        const e = timeToMinutes(b.end_time);
        return reqStart < e && s < reqEnd;
      });
    });
  }, [cabinsQ.data, bookingsQ.data, startTime, endMin]);

  // Clear cabin selection if it becomes unavailable
  useEffect(() => {
    if (cabinId && !availableCabins.find((c) => c.id === cabinId)) setCabinId("");
  }, [availableCabins, cabinId]);

  const selectedCabin = availableCabins.find((c) => c.id === cabinId);
  const isFormValid = !!cabinId && !!purpose.trim() && fitsDay && validStart && !lunchOverlap && !managerConflict;
  const durationMin = timeToMinutes(endTime) - timeToMinutes(startTime);

  const submit = async () => {
    if (!user || !isFormValid) return;
    setSubmitting(true);
    const { error } = await supabase.from("bookings").insert({
      user_id: user.id,
      cabin_id: cabinId,
      booking_date: dateStr,
      candidate_count: candidates,
      start_time: startTime,
      end_time: endTime,
      purpose: purpose.trim(),
    });
    setSubmitting(false);
    if (error) {
      if (error.message.includes("no_overlap_active") || error.code === "23P01") {
        notify.bookingConflict();
      } else {
        notify.error(error.message);
      }
      await qc.invalidateQueries({ queryKey: ["bookings"], refetchType: "all" });
      return;
    }
    notify.bookingCreated({
      cabinName: selectedCabin?.name ?? "Cabin",
      startTime,
      endTime,
      date: dateStr,
    });
    await qc.invalidateQueries({ queryKey: ["bookings"], refetchType: "all" });
    await qc.invalidateQueries({ queryKey: ["my-bookings"], refetchType: "all" });
    navigate({ to: "/my-bookings" });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Book a Cabin</h1>
        <p className="text-sm text-muted-foreground">
          45 min per candidate · 09:00–19:00 · Lunch 13:00–14:00
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* ── Left: form ─────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Manager Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Manager Details</CardTitle>
              <CardDescription>Auto-filled from your profile — click pencil to edit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <EditableTextField
                label="Manager Name"
                value={overrideName}
                isEditing={editField === "name"}
                onEdit={() => setEditField("name")}
                onSave={() => setEditField(null)}
                onCancel={() => { setEditField(null); setOverrideName(profile?.full_name ?? ""); }}
                onChange={setOverrideName}
              />
              <EditableTextField
                label="Employee ID"
                value={overrideEmployeeId}
                isEditing={editField === "employeeId"}
                onEdit={() => setEditField("employeeId")}
                onSave={() => setEditField(null)}
                onCancel={() => { setEditField(null); setOverrideEmployeeId(profile?.employee_id ?? ""); }}
                onChange={setOverrideEmployeeId}
              />
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Department</Label>
                  {editField !== "department" ? (
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditField("department")}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  ) : (
                    <div className="flex gap-1">
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditField(null)}>
                        <CheckCircle2 className="h-3 w-3 text-green-600" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditField(null); setOverrideDepartment(profile?.department ?? ""); }}>
                        <X className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
                {editField === "department" ? (
                  <Select value={overrideDepartment} onValueChange={setOverrideDepartment}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Select department" /></SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-sm font-medium">{overrideDepartment || <span className="text-muted-foreground">—</span>}</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Booking Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Booking Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <RadioGroup value={date} onValueChange={(v) => setDate(v as "today" | "tomorrow")} className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="d-today" value="today" />
                    <Label htmlFor="d-today" className="font-normal cursor-pointer">Today ({todayISO()})</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="d-tomorrow" value="tomorrow" />
                    <Label htmlFor="d-tomorrow" className="font-normal cursor-pointer">Tomorrow ({tomorrowISO()})</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Candidate count */}
                <div className="space-y-2">
                  <Label>Candidate Count</Label>
                  <div className="flex items-center">
                    <Button
                      type="button" variant="outline" size="icon"
                      className="h-9 w-9 rounded-r-none shrink-0"
                      onClick={() => setCandidates((c) => Math.max(1, c - 1))}
                      disabled={candidates <= 1}
                    >−</Button>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={candidateRaw}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
                        setCandidateRaw(raw);
                        const v = parseInt(raw, 10);
                        if (!isNaN(v) && v >= 1 && v <= maxCandidates) setCandidates(v);
                      }}
                      onBlur={() => {
                        const v = parseInt(candidateRaw, 10);
                        const clamped = isNaN(v) ? 1 : Math.min(maxCandidates, Math.max(1, v));
                        setCandidates(clamped);
                        setCandidateRaw(String(clamped));
                      }}
                      onFocus={(e) => e.target.select()}
                      className="h-9 w-14 rounded-none text-center"
                    />
                    <Button
                      type="button" variant="outline" size="icon"
                      className="h-9 w-9 rounded-l-none shrink-0"
                      onClick={() => setCandidates((c) => Math.min(maxCandidates, c + 1))}
                      disabled={candidates >= maxCandidates}
                    >+</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{candidates} × 45 min = {formatDuration(candidates * SLOT_MINUTES)}</p>
                </div>

                {/* Start time */}
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <TimePicker
                    value={startTime}
                    onChange={setStartTime}
                    minTime={`${WORKING_START}:00`}
                    maxTime={`${WORKING_END_EXTENDED}:00`}
                  />
                </div>

                {/* End time */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between h-4">
                    <Label>End Time</Label>
                    {manualEndTime && (
                      <button
                        type="button"
                        className="text-xs text-sky-600 hover:underline leading-none"
                        onClick={() => setManualEndTime(null)}
                      >
                        Reset to auto
                      </button>
                    )}
                  </div>
                  <TimePicker
                    value={endTime}
                    onChange={(v) => setManualEndTime(v === autoEndTime ? null : v)}
                    minTime={startTime}
                    maxTime={`${WORKING_END_EXTENDED}:00`}
                    highlighted={!!manualEndTime}
                  />
                </div>
              </div>

              {/* Validation alerts */}
              {!fitsDay && (
                <Alert icon={<AlertCircle className="h-4 w-4" />} variant="error">
                  End time exceeds 19:00. Reduce candidates or choose an earlier start.
                </Alert>
              )}
              {!validStart && (
                <Alert icon={<AlertCircle className="h-4 w-4" />} variant="error">
                  Start time must be in the future for today&apos;s bookings.
                </Alert>
              )}
              {lunchOverlap && lunchSuggestion && (
                <Alert icon={<Clock className="h-4 w-4" />} variant="warning">
                  <div className="space-y-1">
                    <p className="font-medium">Booking overlaps with lunch break ({LUNCH_START}–{LUNCH_END})</p>
                    <p className="text-xs">
                      Suggestions:{" "}
                      {lunchSuggestion.beforeLunch && (
                        <button
                          type="button"
                          className="text-primary underline underline-offset-2 mr-2"
                          onClick={() => { setStartTime(`${lunchSuggestion.beforeLunch}:00`); setManualEndTime(null); }}
                        >
                          Start at {lunchSuggestion.beforeLunch}
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-primary underline underline-offset-2"
                        onClick={() => { setStartTime(`${lunchSuggestion.afterLunch}:00`); setManualEndTime(null); }}
                      >
                        Start after lunch ({lunchSuggestion.afterLunch})
                      </button>
                    </p>
                  </div>
                </Alert>
              )}
              {managerConflict && (
                <Alert icon={<AlertCircle className="h-4 w-4" />} variant="error">
                  You already have an active booking in another cabin at this time. A manager cannot hold two simultaneous bookings.
                </Alert>
              )}

              {/* Cabin selection — only available cabins shown */}
              <div className="space-y-2">
                <Label>
                  Cabin{" "}
                  <span className="text-xs text-muted-foreground font-normal">(only available cabins shown)</span>
                </Label>
                <Select value={cabinId} onValueChange={setCabinId}>
                  <SelectTrigger>
                    <SelectValue placeholder={
                      availableCabins.length === 0
                        ? "No cabins available for this slot"
                        : "Select a cabin"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCabins.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} · Floor: {c.floor}{c.wing ? ` (${c.wing})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Purpose</Label>
                <Textarea
                  required
                  rows={3}
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Demo for batch 2026-Q2 trainees"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Right: summary card ─────────────────────────────────── */}
        <div className="lg:sticky lg:top-20">
          <Card className={isFormValid ? "border-green-300 bg-green-50/40" : ""}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                {isFormValid
                  ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                  : <Clock className="h-4 w-4 text-muted-foreground" />}
                Booking Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <SummaryRow label="Manager" value={overrideName || profile?.full_name || "—"} />
              <SummaryRow label="Employee ID" value={overrideEmployeeId || profile?.employee_id || "—"} />
              <SummaryRow label="Department" value={overrideDepartment || profile?.department || "—"} />
              <hr />
              <SummaryRow label="Date" value={dateStr} />
              <SummaryRow label="Candidates" value={String(candidates)} />
              <SummaryRow label="Duration" value={durationMin > 0 ? formatDuration(durationMin) : "—"} />
              <SummaryRow label="Start" value={formatTime12h(startTime)} />
              <SummaryRow label="End" value={fitsDay ? formatTime12h(endTime) : "—"} />
              <SummaryRow label="Cabin" value={selectedCabin?.name ?? "—"} />
              {selectedCabin && (
                <SummaryRow
                  label="Floor"
                  value={`${selectedCabin.floor}${selectedCabin.wing ? ` · ${selectedCabin.wing}` : ""}`}
                />
              )}
              <hr />

              {/* Checklist */}
              <div className="space-y-1 pt-1">
                <ChecklistItem ok={!!cabinId} label="Cabin selected" />
                <ChecklistItem ok={!!purpose.trim()} label="Purpose provided" />
                <ChecklistItem ok={fitsDay} label="Within 09:00–19:00" />
                <ChecklistItem ok={validStart} label="Valid start time" />
                <ChecklistItem ok={!lunchOverlap} label="No lunch conflict" />
                <ChecklistItem ok={!managerConflict} label="No simultaneous booking" />
              </div>

              <Button
                className="w-full mt-1"
                onClick={submit}
                disabled={submitting || !isFormValid}
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isFormValid ? "Confirm Booking" : "Complete the form"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Small reusable components ────────────────────────────────────────────────

function EditableTextField({
  label, value, isEditing, onEdit, onSave, onCancel, onChange,
}: {
  label: string; value: string; isEditing: boolean;
  onEdit: () => void; onSave: () => void; onCancel: () => void;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {!isEditing ? (
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onEdit}>
            <Pencil className="h-3 w-3" />
          </Button>
        ) : (
          <div className="flex gap-1">
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onSave}>
              <CheckCircle2 className="h-3 w-3 text-green-600" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onCancel}>
              <X className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        )}
      </div>
      {isEditing ? (
        <Input autoFocus value={value} onChange={(e) => onChange(e.target.value)} className="h-8" />
      ) : (
        <div className="text-sm font-medium">{value || <span className="text-muted-foreground">—</span>}</div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right truncate">{value}</span>
    </div>
  );
}

function ChecklistItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${ok ? "text-green-700" : "text-muted-foreground"}`}>
      <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${ok ? "bg-green-500" : "bg-muted-foreground/30"}`} />
      {label}
    </div>
  );
}

function Alert({
  icon, variant, children,
}: {
  icon: React.ReactNode;
  variant: "error" | "warning";
  children: React.ReactNode;
}) {
  const cls =
    variant === "error"
      ? "border-destructive/30 bg-destructive/5 text-destructive"
      : "border-orange-300 bg-orange-50 text-orange-800";
  return (
    <div className={`flex items-start gap-2 text-sm rounded-md border p-2.5 ${cls}`}>
      <span className="shrink-0 mt-0.5">{icon}</span>
      <div>{children}</div>
    </div>
  );
}
