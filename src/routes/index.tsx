import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/features/auth/AuthProvider";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, loading, isAdmin } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;
  return <Navigate to={isAdmin ? "/admin" : "/dashboard"} />;
}
