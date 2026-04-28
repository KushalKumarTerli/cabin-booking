import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  component: ResetPage,
});

function ResetPage() {
  const [mode, setMode] = useState<"request" | "update">("request");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
      setMode("update");
    }
  }, []);

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("Reset link sent. Check your email.");
  };

  const updatePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Password updated. Please sign in.");
      window.location.href = "/login";
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-muted/40 to-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{mode === "request" ? "Reset password" : "Set new password"}</CardTitle>
          <CardDescription>
            {mode === "request" ? "We'll email you a reset link." : "Choose a new password."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "request" ? (
            <form onSubmit={sendLink} className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Send link
              </Button>
              <Link to="/login" className="block text-center text-sm text-primary hover:underline">
                Back to sign in
              </Link>
            </form>
          ) : (
            <form onSubmit={updatePw} className="space-y-4">
              <div className="space-y-2">
                <Label>New password</Label>
                <Input type="password" required minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Update password
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}