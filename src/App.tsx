import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { OrganizerLayout, Page } from './components/layout';
import { Skeleton } from './components/ui';

// Each page is its own chunk, so someone opening the public chart from a QR
// code does not download the organizer screens or the QR library.
const Campaigns = lazy(() => import('./routes/Campaigns'));
const CampaignNew = lazy(() => import('./routes/CampaignNew'));
const CampaignDetail = lazy(() => import('./routes/CampaignDetail'));
const Login = lazy(() => import('./routes/Login'));
const Outbox = lazy(() => import('./routes/Outbox'));
const MyPortion = lazy(() => import('./routes/MyPortion'));
const NotFound = lazy(() => import('./routes/NotFound'));
const PublicChart = lazy(() => import('./routes/PublicChart'));
const Sign = lazy(() => import('./routes/Sign'));
const Unsubscribe = lazy(() => import('./routes/Unsubscribe'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: true } },
});

function Loading() {
  return (
    <Page narrow>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-6 h-40 w-full" />
    </Page>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Navigate to="/campaigns" replace />} />
            <Route path="/login" element={<Login />} />

            <Route element={<OrganizerLayout />}>
              <Route path="/campaigns" element={<Campaigns />} />
              <Route path="/campaigns/new" element={<CampaignNew />} />
              <Route path="/campaigns/:id" element={<CampaignDetail />} />
              <Route path="/campaigns/:id/sign" element={<Sign />} />
            </Route>

            <Route path="/c/:slug" element={<PublicChart />} />
            <Route path="/m/:token" element={<MyPortion />} />
            <Route path="/unsubscribe/:token" element={<Unsubscribe />} />
            <Route path="/dev/outbox" element={<Outbox />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
