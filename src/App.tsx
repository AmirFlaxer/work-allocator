import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DirectionProvider } from "@radix-ui/react-direction";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured } from "@/lib/supabase";
import { LoginPage, CompleteRegistrationPage } from "@/pages/LoginPage";
import { RegistrantsPage } from "@/pages/RegistrantsPage";
import { SharePage } from "@/pages/SharePage";
import { JoinPage } from "@/pages/JoinPage";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const SUPER_ADMIN_EMAILS = (import.meta.env.VITE_SUPER_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || !SUPER_ADMIN_EMAILS.includes(user.email?.toLowerCase() ?? "")) {
    return <NotFound />;
  }
  return <>{children}</>;
}

function AppContent() {
  return (
    <Routes>
      {/* עמוד ציבורי - נטען בלי שער התחברות */}
      <Route path="/s/:token" element={<SharePage />} />
      {/* עמוד ציבורי - הצטרפות מנהל דרך קישור הזמנה */}
      <Route path="/join/:token" element={<JoinPage />} />
      <Route path="*" element={<AuthenticatedApp />} />
    </Routes>
  );
}

function AuthenticatedApp() {
  const { user, loading, profileMissing } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">טוען...</p>
        </div>
      </div>
    );
  }

  if (isSupabaseConfigured && !user) {
    return <LoginPage />;
  }

  if (isSupabaseConfigured && user && profileMissing) {
    return <CompleteRegistrationPage />;
  }

  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/admin" element={<SuperAdminRoute><RegistrantsPage /></SuperAdminRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <DirectionProvider dir="rtl">
      <TooltipProvider>
        <Toaster />
        <BrowserRouter>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </DirectionProvider>
  </QueryClientProvider>
);

export default App;
