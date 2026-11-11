import { type ReactNode } from 'react';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isSessionLockedError, setSessionLocked } from '@/components/session-lock';
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
import PoliciesPage from '@/pages/policies';
import RulesPage from '@/pages/rules';
import BillingPage from '@/pages/billing';
import ReportsPage from '@/pages/reports';
import DevicesPage from '@/pages/devices';
import MessagesPage from '@/pages/messages';
import AdminPage from '@/pages/admin';
import PatientAppPage from '@/pages/patient-app';
import AccountPage from '@/pages/account';
import ForgotPasswordPage from '@/pages/forgot-password';
import ResetPasswordPage from '@/pages/reset-password';
import { RequirePermission } from '@/components/access';

const PatientsRoute = () => <RequirePermission any={['patients.read']} area="Patients"><PatientsPage /></RequirePermission>;
const ChartRoute = () => <RequirePermission any={['clinical.read']} area="Full patient charts"><PatientDetailPage /></RequirePermission>;
const AdminRoute = () => <RequirePermission any={['admin']} area="Administration"><AdminPage /></RequirePermission>;
const BillingRoute = () => <RequirePermission any={['billing.read']} area="Billing"><BillingPage /></RequirePermission>;
const PoliciesRoute = () => <RequirePermission any={['clinical.read', 'billing.read']} area="Policies and templates"><PoliciesPage /></RequirePermission>;
const RulesRoute = () => <RequirePermission any={['clinical.read']} area="Clinical rules"><RulesPage /></RequirePermission>;
const WorklistsRoute = () => <RequirePermission any={['admin', 'clinical.read', 'devices.write']} area="Worklists"><WorklistsPage /></RequirePermission>;
const ReportsRoute = () => <RequirePermission any={['clinical.read', 'billing.read']} area="Reports"><ReportsPage /></RequirePermission>;

const onLock = (e: unknown) => { if (isSessionLockedError(e)) setSessionLocked(true); };
const CaregiverRoute = () => <NotFound />; // caregiver accounts are rendered by AppShell
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onLock }),
  mutationCache: new MutationCache({ onError: onLock }),
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: (n, e) => n < 1 && !(e && typeof e === 'object' && 'status' in e && [401, 423].includes((e as { status: number }).status)) } },
});

function Router() {
  const [location] = useLocation();
  if (location === '/login') return <RoutedErrorBoundary><LoginPage /></RoutedErrorBoundary>;
  if (location === '/forgot-password') return <RoutedErrorBoundary><ForgotPasswordPage /></RoutedErrorBoundary>;
  if (location === '/reset-password') return <RoutedErrorBoundary><ResetPasswordPage /></RoutedErrorBoundary>;
  return (
    <AppShell>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={TodayPage} />
          <Route path="/worklists" component={WorklistsRoute} />
          <Route path="/patients" component={PatientsRoute} />
          <Route path="/patients/:id" component={ChartRoute} />
          <Route path="/programs" component={ProgramsPage} />
          <Route path="/policies" component={PoliciesRoute} />
          <Route path="/rules" component={RulesRoute} />
          <Route path="/billing" component={BillingRoute} />
          <Route path="/reports" component={ReportsRoute} />
          <Route path="/devices" component={DevicesPage} />
          <Route path="/messages" component={MessagesPage} />
          <Route path="/admin" component={AdminRoute} />
          <Route path="/patient" component={PatientAppPage} />
          <Route path="/caregiver" component={CaregiverRoute} />
          <Route path="/account" component={AccountPage} />
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
