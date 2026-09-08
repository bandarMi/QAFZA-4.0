import { useState } from 'react';
import { useApp } from './state';
import { Shell } from './components/Shell';
import { ChatDrawer } from './components/ChatDrawer';
import { ErrorBox, Skeleton } from './components/ui';
import { Overview } from './pages/Overview';
import { Members, MemberDetail } from './pages/Members';
import { Engagement } from './pages/Engagement';
import { Initiatives } from './pages/Initiatives';
import { Impact } from './pages/Impact';
import { Social } from './pages/Social';
import { AIReports } from './pages/AIReports';
import { Exports } from './pages/Exports';
import { Ingest } from './pages/Ingest';
import { Council } from './pages/Council';
import { Settings } from './pages/Settings';
import { Checkin } from './pages/Checkin';

export function App() {
  const { route, loading, error, refreshBoot } = useApp();
  const [chat, setChat] = useState(false);

  // The QR check-in page is standalone: no shell, no filters, phone-sized.
  const checkinToken = route.match(/^\/checkin\/(.+)$/)?.[1];
  if (checkinToken) return <Checkin token={checkinToken} />;

  if (error) {
    return (
      <div className="p-6 max-w-xl mx-auto mt-16">
        <ErrorBox message={error} onRetry={refreshBoot} />
        <p className="text-[13px] text-ink-muted mt-3 leading-relaxed">
          Start the API with <code className="font-mono bg-surface-sunken px-1 rounded">npm run dev</code> from the project root,
          and load the seed data with <code className="font-mono bg-surface-sunken px-1 rounded">npm run db:reset</code>.
        </p>
      </div>
    );
  }
  if (loading) return <div className="p-6"><Skeleton rows={5} height="h-24" /></div>;

  const memberId = route.match(/^\/members\/(\d+)$/)?.[1];

  const page = () => {
    if (memberId) return <MemberDetail id={Number(memberId)} />;
    switch (route) {
      case '/members':     return <Members />;
      case '/engagement':  return <Engagement />;
      case '/initiatives': return <Initiatives />;
      case '/impact':      return <Impact />;
      case '/social':      return <Social />;
      case '/ai':          return <AIReports onOpenChat={() => setChat(true)} />;
      case '/exports':     return <Exports />;
      case '/ingest':      return <Ingest />;
      case '/council':     return <Council />;
      case '/settings':    return <Settings />;
      default:             return <Overview />;
    }
  };

  return (
    <>
      <Shell onOpenChat={() => setChat(true)}>{page()}</Shell>
      <ChatDrawer open={chat} onClose={() => setChat(false)} />
    </>
  );
}
