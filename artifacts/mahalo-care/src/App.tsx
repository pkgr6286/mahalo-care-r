import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { AppShell } from '@/components/shell';
import LoginPage from '@/pages/login';
import TodayPage from '@/pages/today';
import WorklistsPage from '@/pages/worklists';
import PatientsPage from '@/pages/patients';
import PatientDetailPage from '@/pages/patient-detail';
import ProgramsPage from '@/pages/programs';
import BillingPage from '@/pages/billing';
import ReportsPage from '@/pages/reports';
import DevicesPage from '@/pages/devices';
import MessagesPage from '@/pages/messages';
import AdminPage from '@/pages/admin';
import PatientAppPage from '@/pages/patient-app';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: (n, e) => n < 1 && !(e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) } },
});

function Router() {
  const [location] = useLocation();
  if (location === '/login') {
    return <RoutedErrorBoundary><LoginPage /></RoutedErrorBoundary>;
  }
  return (
    <AppShell>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={TodayPage} />
          <Route path="/worklists" component={WorklistsPage} />
          <Route path="/patients" component={PatientsPage} />
          <Route path="/patients/:id" component={PatientDetailPage} />
          <Route path="/programs" component={ProgramsPage} />
          <Route path="/billing" component={BillingPage} />
          <Route path="/reports" component={ReportsPage} />
          <Route path="/devices" component={DevicesPage} />
          <Route path="/messages" component={MessagesPage} />
          <Route path="/admin" component={AdminPage} />
          <Route path="/patient" component={PatientAppPage} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </AppShell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
