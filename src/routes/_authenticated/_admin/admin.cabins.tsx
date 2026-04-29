import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/admin/cabins")({
  component: AdminCabins,
});

const FLOOR_OPTIONS = ["Ground Floor", "2nd Floor", "4th Floor"] as const;
const WING_OPTIONS = ["East Wing", "West Wing", "North Wing", "South Wing"] as const;

interface Cabin {
  id: string;
  name: string;
  floor: string;
  wing: string | null;
  capacity: number;
  is_active: boolean;
}

function AdminCabins() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Cabin> | null>(null);
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["admin-cabins"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cabins").select("*").order("floor").order("name");
      if (error) throw error;
      return data as Cabin[];
    },
  });

  const save = async () => {
    if (!editing?.name || !editing.floor) {
      toast.error("Name and floor are required");
      return;
    }
    const payload = {
      name: editing.name,
      floor: editing.floor,
      wing: editing.wing ?? null,
      capacity: editing.capacity ?? 1,
      is_active: editing.is_active ?? true,
    };
    const { error } = editing.id
      ? await supabase.from("cabins").update(payload).eq("id", editing.id)
      : await supabase.from("cabins").insert(payload);
    if (error) toast.error(error.message);
    else {
      toast.success(editing.id ? "Cabin updated" : "Cabin added");
      setOpen(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-cabins"] });
      qc.invalidateQueries({ queryKey: ["cabins"] });
    }
  };

  const toggle = async (c: Cabin) => {
    const { error } = await supabase.from("cabins").update({ is_active: !c.is_active }).eq("id", c.id);
    if (error) toast.error(error.message);
    else {
      qc.invalidateQueries({ queryKey: ["admin-cabins"] });
      qc.invalidateQueries({ queryKey: ["cabins"] });
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this cabin? Existing bookings may be affected.")) return;
    const { error } = await supabase.from("cabins").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Cabin deleted");
      qc.invalidateQueries({ queryKey: ["admin-cabins"] });
      qc.invalidateQueries({ queryKey: ["cabins"] });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cabins</h1>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing({ capacity: 2, is_active: true })}>
              <Plus className="h-4 w-4 mr-1" /> Add Cabin
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing?.id ? "Edit" : "Add"} Cabin</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Cabin Name</Label>
                <Input
                  placeholder="e.g. Cabin A1"
                  value={editing?.name ?? ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Floor</Label>
                  <Select
                    value={editing?.floor ?? ""}
                    onValueChange={(v) => setEditing({ ...editing, floor: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select floor" /></SelectTrigger>
                    <SelectContent>
                      {FLOOR_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Wing <span className="text-xs text-muted-foreground">(optional)</span></Label>
                  <Select
                    value={editing?.wing ?? ""}
                    onValueChange={(v) => setEditing({ ...editing, wing: v || null })}
                  >
                    <SelectTrigger><SelectValue placeholder="No wing" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No wing</SelectItem>
                      {WING_OPTIONS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Capacity (seats)</Label>
                <Input
                  type="number" min={1}
                  value={editing?.capacity ?? 1}
                  onChange={(e) => setEditing({ ...editing, capacity: parseInt(e.target.value || "1", 10) })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editing?.is_active ?? true}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
                <Label>Active (visible to users)</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setOpen(false); setEditing(null); }}>Cancel</Button>
              <Button onClick={save}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All cabins ({q.data?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {(q.data ?? []).map((c) => (
              <li key={c.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium flex items-center gap-2 flex-wrap">
                    {c.name}
                    {c.is_active
                      ? <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active</Badge>
                      : <Badge variant="secondary">Inactive</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Floor: {c.floor}{c.wing ? ` · ${c.wing}` : ""} · {c.capacity} seat(s)
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={c.is_active} onCheckedChange={() => toggle(c)} />
                  <Button
                    size="icon" variant="ghost"
                    onClick={() => { setEditing(c); setOpen(true); }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(c.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
