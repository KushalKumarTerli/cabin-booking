import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/_admin/admin/logs")({
  component: AdminLogs,
});

interface LogRow {
  id: string; action_type: string; remarks: string | null; created_at: string;
  performed_by: string | null;
}

function AdminLogs() {
  const [filter, setFilter] = useState("");

  const q = useQuery({
    queryKey: ["admin-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as LogRow[];
    },
  });

  const filtered = (q.data ?? []).filter(
    (l) =>
      !filter ||
      l.action_type.toLowerCase().includes(filter.toLowerCase()) ||
      (l.remarks ?? "").toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Audit logs</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">Filter</CardTitle></CardHeader>
        <CardContent>
          <Input placeholder="Search action or remarks..." value={filter} onChange={(e) => setFilter(e.target.value)} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">{filtered.length} entries</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y">
            {filtered.map((l) => (
              <li key={l.id} className="py-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">{l.action_type}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">{l.remarks}</div>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(l.created_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}