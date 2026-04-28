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
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";
import {
  todayISO,
  tomorrowISO,
  computeEndTime,
  generateTimeSlots,
  formatTime,
  timeToMinutes,
  WORKING_END,
  nowRoundedTo15,
  SLOT_MINUTES,
} from "@/lib/booking-utils";

const searchSchema = z.object({
  cabinId: z.string().optional(),
  date: z.string().optional(),
  start: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/book")({
  validateSearch: searchSchema,
  component: BookPage,
});

interface CabinRow { id: string; name: string; floor: string; wing: string | null; capacity: number; }
interface BookingRow { cabin_id: string; start_time: string; end_time: string; status: string; }

function BookPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, profile } = useAuth();

  const [date, setDate] = useState<"today" | "tomorrow">(search.date === tomorrowISO() ? "tomorrow" : "today");
  const dateStr = date === "today" ? todayISO() : tomorrowISO();

  const [candidates, setCandidates] = useState(1);
  const [startTime, setStartTime] = useState<string>(() => {
    if (search.start) return search.start.length === 5 ? `${search.start}:00` : search.start;
    return date === "today" ? nowRoundedTo15() : "09:00:00";
  });
  const [cabinId, setCabinId] = useState<string>(search.cabinId ?? "");
  const [purpose, setPurpose] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const cabinsQ = useQuery({
    queryKey: ["cabins", "active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cabins").select("*").eq("is_active", true).order("floor").order("name");
      if (error) throw error;
      return data as CabinRow[];
    },
  });

  const bookingsQ = useQuery({
    queryKey: ["bookings", "by-date", dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("cabin_id, start_time, end_time, status")
        .eq("booking_date", dateStr)
        .eq("status", "active");
      if (error) throw error;
      return data as BookingRow[];
    },
  });

  const slots = useMemo(() => generateTimeSlots(), []);
  const endTime = useMemo(() => computeEndTime(startTime, candidates), [startTime, candidates]);
  const endMin = timeToMinutes(endTime);
  const fitsDay = endMin <= timeToMinutes(WORKING_END);

  const nowMin = (() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  })();

  const validStart = date === "tomorrow" || timeToMinutes(startTime) >= nowMin;

  const availableCabins = useMemo(() => {
    const cabins = cabinsQ.data ?? [];
    const bks = bookingsQ.data ?? [];
    const reqStart = timeToMinutes(startTime);
    const reqEnd = endMin;
    return cabins.filter((c) => {
      const conflicts = bks.filter((b) => b.cabin_id === c.id).some((b) => {
        const s = timeToMinutes(b.start_time);
        const e = timeToMinutes(b.end_time);
        return reqStart < e && s < reqEnd;
      });
      return !conflicts;
    });
  }, [cabinsQ.data, bookingsQ.data, startTime, endMin]);

  // clamp candidates to fit working day
  useEffect(() => {
    const maxCandidates = Math.floor((timeToMinutes(WORKING_END) - timeToMinutes(startTime)) / SLOT_MINUTES);
    if (maxCandidates < 1) return;
    if (candidates > maxCandidates) setCandidates(maxCandidates);
  }, [startTime, candidates]);

  // clear selected cabin if it becomes unavailable
  useEffect(() => {
    if (cabinId && !availableCabins.find((c) => c.id === cabinId)) {
      setCabinId("");
    }
  }, [availableCabins, cabinId]);

  const selectedCabin = availableCabins.find((c) => c.id === cabinId);

  const submit = async () => {
    if (!user || !cabinId || !purpose.trim() || !fitsDay || !validStart) return;
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
        toast.error("This cabin was just booked for an overlapping slot. Pick another time or cabin.");
      } else {
        toast.error(error.message);
      }
      qc.invalidateQueries({ queryKey: ["bookings"] });
      return;
    }
    toast.success("Booking confirmed");
    qc.invalidateQueries({ queryKey: ["bookings"] });
    navigate({ to: "/my-bookings" });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Book a cabin</h1>
        <p className="text-sm text-muted-foreground">45 minutes per candidate · 09:00–18:00</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Booking details</CardTitle>
          <CardDescription>Manager info is auto-filled from your profile.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="space-y-1"><Label className="text-xs">Manager</Label><div className="font-medium">{profile?.full_name}</div></div>
            <div className="space-y-1"><Label className="text-xs">Employee ID</Label><div className="font-medium">{profile?.employee_id}</div></div>
            <div className="space-y-1"><Label className="text-xs">Department</Label><div className="font-medium">{profile?.department}</div></div>
          </div>

          <div className="space-y-2">
            <Label>Date</Label>
            <RadioGroup value={date} onValueChange={(v) => setDate(v as "today" | "tomorrow")} className="flex gap-6">
              <div className="flex items-center gap-2"><RadioGroupItem id="d-today" value="today" /><Label htmlFor="d-today" className="font-normal">Today ({todayISO()})</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem id="d-tomorrow" value="tomorrow" /><Label htmlFor="d-tomorrow" className="font-normal">Tomorrow ({tomorrowISO()})</Label></div>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Candidates</Label>
              <Input type="number" min={1} max={12} value={candidates} onChange={(e) => setCandidates(Math.max(1, parseInt(e.target.value || "1", 10)))} />
            </div>
            <div className="space-y-2">
              <Label>Start time</Label>
              <Select value={startTime} onValueChange={setStartTime}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {slots.map((s) => (
                    <SelectItem key={s} value={s}>{formatTime(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>End time</Label>
              <Input value={formatTime(endTime)} readOnly className="bg-muted" />
            </div>
          </div>

          {!fitsDay && <p className="text-sm text-destructive">End time exceeds 18:00. Reduce candidates or pick an earlier start.</p>}
          {!validStart && <p className="text-sm text-destructive">Start time must be in the future.</p>}

          <div className="space-y-2">
            <Label>Cabin (only available cabins shown)</Label>
            <Select value={cabinId} onValueChange={setCabinId}>
              <SelectTrigger><SelectValue placeholder={availableCabins.length === 0 ? "No cabins available for this slot" : "Select a cabin"} /></SelectTrigger>
              <SelectContent>
                {availableCabins.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} · {c.floor}{c.wing ? ` (${c.wing})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Purpose</Label>
            <Textarea required value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Demo for batch 2026-Q2 trainees" />
          </div>
        </CardContent>
      </Card>

      {selectedCabin && fitsDay && validStart && purpose.trim() && (
        <Card className="border-success/50 bg-success/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" /> Confirm booking</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><div className="text-xs text-muted-foreground">Cabin</div><div className="font-medium">{selectedCabin.name}</div></div>
              <div><div className="text-xs text-muted-foreground">Date</div><div className="font-medium">{dateStr}</div></div>
              <div><div className="text-xs text-muted-foreground">Window</div><div className="font-medium">{formatTime(startTime)} – {formatTime(endTime)}</div></div>
              <div><div className="text-xs text-muted-foreground">Candidates</div><div className="font-medium">{candidates} · {candidates * SLOT_MINUTES} min</div></div>
            </div>
            <Button className="w-full" onClick={submit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Confirm booking
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}