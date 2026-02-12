import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import Login from "@/pages/Login";
import POS from "@/pages/POS";
import Dashboard from "@/pages/Dashboard";
import Reports from "@/pages/Reports";
import CashClose from "@/pages/CashClose";
import Customers from "@/pages/Customers";
import Memberships from "@/pages/Memberships";
import Services from "@/pages/Services";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/NotFound";
import DBValidation from "@/pages/DBValidation";
import CreateAdmin from "@/pages/CreateAdmin";

const queryClient = new QueryClient();

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!isAdmin) return <Navigate to="/pos" replace />;
  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function RootRedirect() {
  const { user, profile, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={profile?.role === "admin" ? "/dashboard" : "/pos"} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<RootRedirect />} />
            <Route path="/pos" element={<ProtectedRoute><POS /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><AdminRoute><Dashboard /></AdminRoute></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><AdminRoute><Reports /></AdminRoute></ProtectedRoute>} />
            <Route path="/cash-close" element={<ProtectedRoute><AdminRoute><CashClose /></AdminRoute></ProtectedRoute>} />
            <Route path="/customers" element={<ProtectedRoute><AdminRoute><Customers /></AdminRoute></ProtectedRoute>} />
            <Route path="/memberships" element={<ProtectedRoute><AdminRoute><Memberships /></AdminRoute></ProtectedRoute>} />
            <Route path="/services" element={<ProtectedRoute><AdminRoute><Services /></AdminRoute></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><AdminRoute><Settings /></AdminRoute></ProtectedRoute>} />
            <Route path="/db-validation" element={<DBValidation />} />
            <Route path="/create-admin" element={<CreateAdmin />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
