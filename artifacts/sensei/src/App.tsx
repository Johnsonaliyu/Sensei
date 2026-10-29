import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createClient, type Session } from '@supabase/supabase-js';
import {
  Activity, ArrowDownRight, ArrowRight, Eye, EyeOff, Bot, Building2, Check, CheckCircle2, CircleHelp,
  FileText, LogOut, MessageCircle, MessageSquare, Phone, QrCode, RefreshCw, Search, Send,
  Settings as SettingsIcon, ShieldCheck, Sparkles, Users, Wifi,
} from 'lucide-react';
import {
  getGetBotConfigQueryKey, getGetSenseiDashboardQueryKey, getGetWhatsappStatusQueryKey,
  getHealthCheckQueryKey, getListConversationsQueryKey, setAuthTokenGetter,
  useConnectWhatsapp, useDisconnectWhatsapp, useGetBotConfig, useGetSenseiDashboard,
  useGetWhatsappStatus, useHealthCheck, useListConversations, useSaveBotConfig, useTestBotReply,
} from '@workspace/api-client-react';
import type { BotConfigInput, ConversationSummary, UseCase, BotTone } from '@workspace/api-client-react';
import { Link, Route, Switch, useLocation } from 'wouter';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 20_000 } } });
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
setAuthTokenGetter(supabase ? async () => (await supabase.auth.getSession()).data.session?.access_token ?? null : null);

type AuthContextValue = { session: Session | null; ready: boolean; authError: string | null; signOut: () => Promise<void> };
const AuthContext = createContext<AuthContextValue>({ session: null, ready: false, authError: null, signOut: async () => undefined });
const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase) { setAuthError('Authentication is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to continue.'); setReady(true); return; }
    let mounted = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setAuthError(error.message);
      setSession(data.session); setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setReady(true);
      queryClient.clear();
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);
  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setAuthError(error.message);
    queryClient.clear();
    setSession(null);
  };
  return <AuthContext.Provider value={{ session, ready, authError, signOut }}>{children}</AuthContext.Provider>;
}

function PageLoader() {
  return <div className="app-shell"><div className="sidebar"><div className="brand"><BrandMark/>sensei</div><div className="workspace-label">Workspace</div><div className="skeleton" style={{ margin: '8px 12px', width: '70%', height: 32 }}/></div><main className="main-area"><div className="topbar"/><div className="page-wrap"><div className="skeleton" style={{ width: 220, height: 30, marginBottom: 16 }}/><div className="skeleton" style={{ width: 360, height: 14, marginBottom: 32 }}/><div className="stat-grid">{[1,2,3,4].map((i) => <div className="panel stat-card" key={i}><div className="skeleton" style={{ width: 90 }}/><div className="skeleton" style={{ width: 72, height: 27, marginTop: 20 }}/></div>)}</div></div></main></div>;
}

function BrandMark() { return <span className="brand-mark"><Bot size={18}/></span>; }
function Logo({ to = '/' }: { to?: string }) { return <Link href={to} className="brand"><BrandMark/>sensei</Link>; }

function Protected({ children }: { children: ReactNode }) {
  const { session, ready } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => { if (ready && !session) setLocation('/login'); }, [ready, session, setLocation]);
  if (!ready || !session) return <PageLoader/>;
  return <>{children}</>;
}

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: Activity },
  { href: '/assistant', label: 'Assistant', icon: Bot },
  { href: '/conversations', label: 'Conversations', icon: MessageSquare },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
];

function AppShell({ children, active }: { children: ReactNode; active: string }) {
  const { session, signOut } = useAuth();
  const email = session?.user.email ?? 'Workspace member';
  const initial = email.slice(0, 1).toUpperCase();
  return <div className="app-shell">
    <aside className="sidebar">
      <Logo to="/dashboard"/>
      <div className="workspace-label">Workspace</div>
      <nav className="nav-links">{navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${active === href ? 'active' : ''}`} data-testid={`link-nav-${label.toLowerCase()}`}><Icon size={17}/>{label}</Link>)}</nav>
      <div className="sidebar-spacer"/>
      <div className="sidebar-help"><CircleHelp size={16} color="#98c6aa"/><strong>Need a hand?</strong><p>Get the essentials right and your assistant is ready to help.</p><Link href="/assistant" className="nav-link" style={{ height: 30, padding: 0, fontSize: 10, color: '#bcd7c8' }}>Review your assistant <ArrowRight size={12}/></Link></div>
      <div className="side-user"><div className="user-initial">{initial}</div><div className="side-user-info"><b>{email.split('@')[0]}</b><span>Business workspace</span></div><button className="logout-button" onClick={signOut} data-testid="button-sign-out" title="Log out"><LogOut size={15}/><span>Log out</span></button></div>
    </aside>
    <main className="main-area"><header className="topbar"><div className="crumb"><span>Workspace</span><span style={{ margin: '0 9px', color: '#b2bbb9' }}>/</span><b>{navItems.find((item) => item.href === active)?.label}</b></div><div className="top-actions"><div className="top-status"><span className="status-dot"/>Workspace secure</div><button className="icon-button" aria-label="Help center" title="Help center" data-testid="button-help"><CircleHelp size={16}/></button></div></header>{children}</main>
  </div>;
}

function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return <div className="error-box" data-testid="status-api-error"><span>{message || 'We could not load this information right now.'}</span><button className="btn btn-small" onClick={retry} data-testid="button-retry">Try again <RefreshCw size={12}/></button></div>;
}

function StatusPill({ state }: { state: string }) {
  const warn = ['needs_human', 'error', 'reconnecting', 'connecting', 'qr_ready'].includes(state);
  const muted = ['resolved', 'disconnected'].includes(state);
  return <span className={`state-pill ${warn ? 'warn' : muted ? 'muted' : ''}`}>{state.replaceAll('_', ' ')}</span>;
}

function timeAgo(date: string) {
  const ms = Date.now() - new Date(date).getTime();
  if (!Number.isFinite(ms)) return 'Recently';
  if (ms < 60_000) return 'Just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join(''); }
function formatUseCase(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*([^*\n]+)\*\*|__([^_\n]+)__|`([^`\n]+)`|\*([^*\n]+)\*|_([^_\n]+)_/g;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) nodes.push(text.slice(lastIndex, index));
    const content = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? '';
    const key = `inline-${index}`;
    if (match[1] || match[2]) nodes.push(<strong key={key}>{content}</strong>);
    else if (match[3]) nodes.push(<code key={key}>{content}</code>);
    else nodes.push(<em key={key}>{content}</em>);
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.length ? nodes : [text];
}

function AssistantMessage({ text }: { text: string }) {
  const normalized = text
    .replace(/\r\n?/g, '\n')
    .replace(/([^\n])\s+[*•]\s+(?=(?:\*\*|__|`|[A-Z]))/g, '$1\n- ')
    .replace(/([^\n])\s+(\d{1,2}[.)])\s+(?=(?:\*\*|__|[A-Z]))/g, '$1\n$2 ')
    .trim();
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let listItems: { text: string; ordered: boolean }[] = [];

  const flushParagraph = () => {
    const content = paragraph.join(' ').trim();
    if (content) blocks.push(<p key={`paragraph-${blocks.length}`}>{renderInlineMarkdown(content)}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!listItems.length) return;
    const isOrdered = listItems[0].ordered;
    const List = isOrdered ? 'ol' : 'ul';
    blocks.push(<List key={`list-${blocks.length}`}>{listItems.map((item, index) => <li key={index}>{renderInlineMarkdown(item.text)}</li>)}</List>);
    listItems = [];
  };

  for (const rawLine of normalized.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const Heading = heading[1].length === 1 ? 'h3' : 'h4';
      blocks.push(<Heading key={`heading-${blocks.length}`}>{renderInlineMarkdown(heading[2])}</Heading>);
      continue;
    }

    const unordered = line.match(/^[-*+•]\s+(.+)$/);
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      if (listItems.length && listItems[0].ordered !== isOrdered) flushList();
      listItems.push({ text: (unordered ?? ordered)![1], ordered: isOrdered });
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return <div className="chat-markdown">{blocks.length ? blocks : renderInlineMarkdown(text)}</div>;
}

function ConversationRows({ conversations }: { conversations: ConversationSummary[] }) {
  if (!conversations.length) return <div className="empty-state"><div className="empty-icon"><MessageSquare size={20}/></div><h3>No conversations yet</h3><p>When a customer sends your business a message, the conversation will show up here.</p></div>;
  return <div>{conversations.map((item) => <div className="conversation-row" key={item.id} data-testid={`row-conversation-${item.id}`}><div className="avatar">{initials(item.customerName) || <Users size={15}/>}</div><div className="conversation-main"><strong>{item.customerName || item.customerPhone}</strong><p>{item.preview}</p></div><div className="conversation-meta"><div>{timeAgo(item.lastMessageAt)}</div>{item.unreadCount > 0 && <span className="unread">{item.unreadCount}</span>}</div></div>)}</div>;
}

function DashboardPage() {
  const query = useGetSenseiDashboard({ query: { queryKey: getGetSenseiDashboardQueryKey(), refetchOnMount: 'always' } });
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), staleTime: 60_000 } });
  const status = useGetWhatsappStatus({ query: { queryKey: getGetWhatsappStatusQueryKey(), refetchInterval: (q) => ['connecting', 'qr_ready', 'reconnecting'].includes(q.state.data?.connectionState ?? '') ? 2500 : false } });
  const connect = useConnectWhatsapp({ mutation: { onSuccess: (value) => queryClient.setQueryData(getGetWhatsappStatusQueryKey(), value) } });
  const disconnect = useDisconnectWhatsapp({ mutation: { onSuccess: (value) => { queryClient.setQueryData(getGetWhatsappStatusQueryKey(), value); queryClient.invalidateQueries({ queryKey: getGetSenseiDashboardQueryKey() }); } } });
  const data = query.data;
  return <AppShell active="/dashboard"><div className="page-wrap">
    <div className="page-heading"><div><div className="eyebrow">Your workspace</div><h1>Good to see you{data?.businessName ? `, ${data.businessName}` : ''}.</h1><p>Here is what is happening with your customer conversations.</p></div><Link className="btn btn-primary" href="/assistant"><Bot size={15}/>Configure assistant</Link></div>
    {!health.isLoading && health.isError && <div style={{ marginBottom: 16 }}><ErrorState message="The Sensei service is not responding. Your workspace data may be unavailable." retry={() => health.refetch()}/></div>}
    {query.isLoading && <div className="stat-grid">{[0,1,2,3].map((i) => <div className="panel stat-card" key={i}><div className="skeleton" style={{ width: 100 }}/><div className="skeleton" style={{ width: 70, height: 26, marginTop: 22 }}/></div>)}</div>}
    {query.isError && <ErrorState message="Your workspace overview could not be loaded." retry={() => query.refetch()}/>}
    {data && <>
      <div className="stat-grid">
        <StatCard label="Conversations today" value={data.conversationsToday.toLocaleString()} foot="Customer conversations" icon={<MessageCircle size={15}/>} trend="Activity"/>
        <StatCard label="Messages this month" value={data.messagesThisMonth.toLocaleString()} foot="Across all customers" icon={<MessageSquare size={15}/>} trend="Volume"/>
        <StatCard label="Response rate" value={`${data.responseRate}%`} foot="Assistant replies delivered" icon={<CheckCircle2 size={15}/>} trend="Service"/>
        <StatCard label="Assistant status" value={data.botActive ? 'Active' : 'Paused'} foot={formatUseCase(data.useCase)} icon={<Bot size={15}/>} trend={data.botActive ? 'Running' : 'Paused'} isStatus/>
      </div>
      <div className="grid-two">
        <section className="panel"><div className="panel-head"><div><h2>Recent conversations</h2><p>Your latest customer messages</p></div><Link href="/conversations" className="btn btn-small">View all <ArrowRight size={13}/></Link></div><ConversationRows conversations={data.recentConversations ?? []}/></section>
        <section className="panel"><div className="panel-head"><div><h2>WhatsApp connection</h2><p>Business messaging channel</p></div><StatusPill state={status.data?.connectionState ?? data.whatsappStatus}/></div><ConnectionSummary status={status.data} loading={status.isLoading} connecting={connect.isPending} disconnecting={disconnect.isPending} onConnect={() => connect.mutate()} onDisconnect={() => disconnect.mutate()} error={status.error ? 'Connection status is unavailable.' : null}/></section>
      </div>
    </>}
  </div></AppShell>;
}
function StatCard({ label, value, foot, icon, trend, isStatus = false }: { label: string; value: string; foot: string; icon: ReactNode; trend: string; isStatus?: boolean }) {
  return <div className="panel stat-card" data-testid={`stat-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="stat-label"><span className="stat-icon">{icon}</span>{label}</div><div className="stat-number" style={isStatus ? { fontSize: 22 } : undefined}>{value}</div><div className="stat-foot">{foot}</div><span style={{ position: 'absolute', right: 15, bottom: 17, color: '#9da9a4', fontSize: 9 }}>{trend}</span></div>;
}

function ConnectionSummary({ status, loading, connecting, disconnecting, onConnect, onDisconnect, error }: { status?: { connectionState: string; phoneNumber: string | null; qrCodeDataUrl: string | null; qrExpiresAt: Date | string | null; error: string | null }; loading: boolean; connecting: boolean; disconnecting: boolean; onConnect: () => void; onDisconnect: () => void; error: string | null }) {
  const state = status?.connectionState ?? 'disconnected';
  const paired = state === 'connected';
  return <div className="connection-card">
    {loading ? <div className="skeleton" style={{ height: 86 }}/> : error ? <div className="error-box">{error}</div> : <div className="connection-banner"><span className="connection-symbol">{paired ? <Check size={18}/> : <QrCode size={18}/>}</span><div><strong>{paired ? 'WhatsApp is connected' : state === 'qr_ready' ? 'Ready to pair your number' : state === 'connecting' ? 'Preparing secure connection' : state === 'error' ? 'Connection needs attention' : 'Connect your WhatsApp number'}</strong><p>{paired ? `Messages are being handled for ${status?.phoneNumber ?? 'your business number'}.` : status?.error || 'Pair your business number by scanning a secure QR code from WhatsApp.'}</p></div></div>}
    {status?.qrCodeDataUrl && state === 'qr_ready' && <div style={{ textAlign: 'center', marginTop: 15 }}><img src={status.qrCodeDataUrl} alt="WhatsApp pairing QR code" style={{ width: 150, height: 150, border: '1px solid #e5e9e3', borderRadius: 8, padding: 7 }}/><p style={{ fontSize: 10, color: '#7c898d', margin: '7px 0 0' }}>Open WhatsApp on your phone, then scan this code.</p></div>}
    {!loading && <div className="connection-actions">{paired ? <button className="btn btn-danger btn-small" onClick={onDisconnect} disabled={disconnecting} data-testid="button-disconnect-whatsapp">{disconnecting ? 'Disconnecting…' : 'Disconnect number'}</button> : <button className="btn btn-primary btn-small" onClick={onConnect} disabled={connecting || state === 'connecting'} data-testid="button-connect-whatsapp"><QrCode size={13}/>{connecting || state === 'connecting' ? 'Preparing QR code…' : state === 'qr_ready' ? 'Refresh QR code' : 'Connect WhatsApp'}</button>}</div>}
    {status?.qrExpiresAt && state === 'qr_ready' && <div className="info-line"><span>QR code expires</span><strong>{new Date(status.qrExpiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong></div>}
  </div>;
}

const useCases: { value: UseCase; label: string; description: string }[] = [
  { value: 'customer_support', label: 'Customer support', description: 'Answer questions and help customers.' },
  { value: 'lead_generation', label: 'Lead generation', description: 'Qualify prospects and capture intent.' },
  { value: 'appointment_booking', label: 'Appointment booking', description: 'Help customers find a time to meet.' },
  { value: 'order_updates', label: 'Order updates', description: 'Share helpful order and delivery updates.' },
  { value: 'faq_assistant', label: 'Frequently asked questions', description: 'Give clear answers about your business.' },
  { value: 'custom', label: 'Something else', description: 'Set a specific role for your assistant.' },
];
const defaultConfig: BotConfigInput = { businessName: '', useCase: 'customer_support', description: '', systemPrompt: '', welcomeMessage: '', tone: 'friendly', isActive: true };

function AssistantPage() {
  const query = useGetBotConfig({ query: { queryKey: getGetBotConfigQueryKey(), refetchOnMount: 'always' } });
  const save = useSaveBotConfig({ mutation: { onSuccess: (value) => { queryClient.setQueryData(getGetBotConfigQueryKey(), value); queryClient.invalidateQueries({ queryKey: getGetSenseiDashboardQueryKey() }); } } });
  const [form, setForm] = useState<BotConfigInput>(defaultConfig);
  const [initializedId, setInitializedId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState('');
  const [testHistory, setTestHistory] = useState<{ role: 'user' | 'bot'; text: string }[]>([]);
  const testReply = useTestBotReply();
  useEffect(() => {
    if (query.data && initializedId !== query.data.id) {
      setForm({ businessName: query.data.businessName, useCase: query.data.useCase, description: query.data.description, systemPrompt: query.data.systemPrompt, welcomeMessage: query.data.welcomeMessage, tone: query.data.tone, isActive: query.data.isActive });
      setInitializedId(query.data.id);
    }
  }, [query.data, initializedId]);
  const setField = <K extends keyof BotConfigInput>(key: K, value: BotConfigInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate({ data: form }, { onSuccess: () => setSavedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) });
  };
  const sendTest = (event: FormEvent) => {
    event.preventDefault();
    const message = testMessage.trim();
    if (!message || testReply.isPending) return;
    setTestHistory((items) => [...items, { role: 'user', text: message }]);
    setTestMessage('');
    testReply.mutate({ data: { message } }, { onSuccess: (reply) => setTestHistory((items) => [...items, { role: 'bot', text: reply.reply }]), onError: () => setTestHistory((items) => [...items, { role: 'bot', text: 'The test could not reach the assistant. Please try again.' }]) });
  };
  return <AppShell active="/assistant"><div className="page-wrap">
    <div className="page-heading"><div><div className="eyebrow">Assistant setup</div><h1>Give your assistant its direction.</h1><p>Shape how it speaks, what it knows, and what it is here to do.</p></div><button className="btn btn-primary" type="submit" form="assistant-config-form" disabled={save.isPending || query.isLoading} data-testid="button-save-assistant"><Check size={14}/>{save.isPending ? 'Saving…' : 'Save changes'}</button></div>
    {query.isLoading && <div className="panel panel-body"><div className="skeleton" style={{ height: 24, width: 210, marginBottom: 18 }}/><div className="skeleton" style={{ height: 120 }}/></div>}
    {query.isError && <ErrorState message="Assistant settings could not be loaded." retry={() => query.refetch()}/>}
    {save.isError && <div style={{ marginBottom: 15 }}><ErrorState message="Your changes were not saved. Check your connection and try again." retry={() => save.reset()}/></div>}
    {!query.isLoading && !query.isError && <div className="assistant-layout">
      <form className="panel" id="assistant-config-form" onSubmit={submit}>
        <div className="panel-head"><div><h2>Assistant identity</h2><p>Start with the essential context for your business.</p></div>{savedAt && <span style={{ fontSize: 10, color: '#748b7e' }}>Saved at {savedAt}</span>}</div>
        <div className="panel-body">
          <div className="form-grid">
            <div className="field span-two"><label htmlFor="business-name">Business name</label><input id="business-name" data-testid="input-business-name" value={form.businessName} onChange={(event) => setField('businessName', event.target.value)} required maxLength={120} placeholder="Your business name"/></div>
            <div className="field span-two"><label>What should your assistant do?</label><div className="choice-grid">{useCases.map((item) => <button key={item.value} type="button" className={`choice ${form.useCase === item.value ? 'active' : ''}`} onClick={() => setField('useCase', item.value)} data-testid={`choice-use-case-${item.value}`}><b>{item.label}</b><span>{item.description}</span></button>)}</div></div>
            <div className="field span-two"><label htmlFor="business-description">A little about your business</label><textarea id="business-description" data-testid="input-business-description" value={form.description} onChange={(event) => setField('description', event.target.value)} maxLength={2000} placeholder="What do you offer? Who do you serve? Include details that help the assistant be useful."/><small>Useful context helps your assistant give accurate answers.</small></div>
            <div className="field"><label htmlFor="assistant-tone">Conversation tone</label><select id="assistant-tone" data-testid="select-assistant-tone" value={form.tone} onChange={(event) => setField('tone', event.target.value as BotTone)}>{(['friendly', 'professional', 'concise', 'warm'] as BotTone[]).map((tone) => <option value={tone} key={tone}>{tone[0].toUpperCase() + tone.slice(1)}</option>)}</select></div>
            <div className="field"><label htmlFor="welcome-message">First message</label><input id="welcome-message" data-testid="input-welcome-message" value={form.welcomeMessage} onChange={(event) => setField('welcomeMessage', event.target.value)} maxLength={1000} placeholder="How should it greet someone?"/></div>
            <div className="field span-two"><label htmlFor="system-prompt">Instructions for your assistant</label><textarea id="system-prompt" data-testid="input-system-prompt" style={{ minHeight: 125 }} value={form.systemPrompt} onChange={(event) => setField('systemPrompt', event.target.value)} maxLength={8000} placeholder="Describe how to answer, what to ask, and when to hand the conversation to your team."/><small>Keep instructions practical. The assistant follows them in every conversation.</small></div>
          </div>
          <div className="toggle-row"><div><strong>Assistant is active</strong><span>When active, your assistant can reply to incoming messages.</span></div><button type="button" className={`switch ${form.isActive ? 'on' : ''}`} role="switch" aria-checked={form.isActive} onClick={() => setField('isActive', !form.isActive)} data-testid="switch-assistant-active"><span/></button></div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn btn-primary" type="submit" disabled={save.isPending} data-testid="button-save-assistant-form">{save.isPending ? 'Saving changes…' : 'Save assistant'}</button></div>
        </div>
      </form>
      <section className="panel test-panel">
        <div className="test-header">
          <div><h2>Try a conversation</h2><p>Test your assistant before customers do.</p></div>
          <span className="live-tag">SANDBOX</span>
        </div>
        <div className="chat-window">
          {testHistory.length === 0 ? <>
            <div className="chat-bubble bot" data-testid="assistant-welcome-message">
              <AssistantMessage text={form.welcomeMessage || 'Your assistant’s first message will appear here.'}/>
            </div>
            <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 215, color: '#95a09f', fontSize: 10, lineHeight: 1.6 }}>
              <Sparkles size={17} style={{ marginBottom: 8, color: '#659579' }}/><br/>
              Send a sample message to see how your assistant responds.
            </div>
          </> : testHistory.map((entry, index) =>
            <div key={`${index}-${entry.role}`} className={`chat-bubble ${entry.role === 'bot' ? 'bot' : 'user'}`} data-testid={`chat-message-${index}-${entry.role}`}>
              {entry.role === 'bot' ? <AssistantMessage text={entry.text}/> : entry.text}
            </div>
          )}
          {testReply.isPending && <div className="chat-bubble bot"><span className="skeleton" style={{ display: 'inline-block', width: 122 }}/></div>}
        </div>
        <form className="chat-compose" onSubmit={sendTest}>
          <input value={testMessage} onChange={(event) => setTestMessage(event.target.value)} placeholder="Write a test message…" aria-label="Test message" data-testid="input-test-message"/>
          <button className="btn btn-primary btn-small" type="submit" disabled={!testMessage.trim() || testReply.isPending} aria-label="Send test message" data-testid="button-send-test"><Send size={14}/></button>
        </form>
        {testReply.data && <div className="chat-meta">Powered by {testReply.data.provider === 'groq' ? 'Groq' : 'NVIDIA'}{testReply.data.usedFallback ? ' · fallback response' : ''}</div>}
      </section>
    </div>}
  </div></AppShell>;
}

function ConversationsPage() {
  const query = useListConversations({ query: { queryKey: getListConversationsQueryKey(), refetchOnMount: 'always' } });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const filtered = useMemo(() => (query.data ?? []).filter((item) => {
    const matches = `${item.customerName} ${item.customerPhone} ${item.preview}`.toLowerCase().includes(search.toLowerCase());
    return matches && (filter === 'all' || item.state === filter);
  }), [query.data, search, filter]);
  return <AppShell active="/conversations"><div className="page-wrap">
    <div className="page-heading"><div><div className="eyebrow">Customer conversations</div><h1>Every conversation, in view.</h1><p>Keep a clear picture of what customers are asking.</p></div><div className="top-status"><span className="status-dot"/>{query.data?.length ?? '—'} conversations</div></div>
    <section className="panel"><div className="panel-head"><div><h2>Recent messages</h2><p>Most recently active customer threads</p></div><button className="icon-button" aria-label="Refresh conversations" onClick={() => query.refetch()} data-testid="button-refresh-conversations"><RefreshCw size={15}/></button></div>
      <div className="filter-bar"><div className="search-box"><Search size={14} color="#87949a"/><input placeholder="Find a customer or message" value={search} onChange={(event) => setSearch(event.target.value)} data-testid="input-search-conversations"/></div><select className="filter-select" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter conversations" data-testid="select-conversation-filter"><option value="all">All conversations</option><option value="open">Open</option><option value="needs_human">Needs your team</option><option value="resolved">Resolved</option></select><span style={{ fontSize: 10, color: '#89949a', marginLeft: 'auto' }}>{filtered.length} shown</span></div>
      {query.isLoading && <div style={{ padding: 20 }}>{[1,2,3,4].map((item) => <div key={item} style={{ display: 'flex', gap: 15, marginBottom: 20 }}><div className="skeleton" style={{ width: 38, height: 38, borderRadius: '50%' }}/><div style={{ flex: 1 }}><div className="skeleton" style={{ width: '30%', marginBottom: 9 }}/><div className="skeleton" style={{ width: '70%' }}/></div></div>)}</div>}
      {query.isError && <div style={{ padding: 20 }}><ErrorState message="Conversations could not be loaded." retry={() => query.refetch()}/></div>}
      {query.data && !query.isLoading && (filtered.length ? <div>{filtered.map((item) => <div className="conversation-row" key={item.id} data-testid={`row-conversation-${item.id}`}><div className="avatar">{initials(item.customerName) || <Users size={15}/>}</div><div className="conversation-main"><strong>{item.customerName || 'Unknown customer'}</strong><p>{item.customerPhone} · {item.preview}</p></div><div style={{ textAlign: 'right', display: 'grid', justifyItems: 'end', gap: 6 }}><span style={{ fontSize: 10, color: '#8b969d' }}>{timeAgo(item.lastMessageAt)}</span><StatusPill state={item.state}/></div></div>)}</div> : <div className="empty-state"><div className="empty-icon"><Search size={19}/></div><h3>{query.data.length ? 'No matching conversations' : 'A quieter inbox, for now'}</h3><p>{query.data.length ? 'Try another name, number, or conversation status.' : 'When a customer messages your WhatsApp number, their conversation will appear here.'}</p>{(search || filter !== 'all') && <button className="btn btn-small" onClick={() => { setSearch(''); setFilter('all'); }} data-testid="button-clear-filters">Clear filters</button>}</div>)}
    </section>
  </div></AppShell>;
}

function SettingsPage() {
  const config = useGetBotConfig({ query: { queryKey: getGetBotConfigQueryKey(), refetchOnMount: 'always' } });
  const whatsapp = useGetWhatsappStatus({ query: { queryKey: getGetWhatsappStatusQueryKey(), refetchInterval: (q) => ['connecting', 'qr_ready', 'reconnecting'].includes(q.state.data?.connectionState ?? '') ? 2500 : false } });
  const save = useSaveBotConfig({ mutation: { onSuccess: (value) => { queryClient.setQueryData(getGetBotConfigQueryKey(), value); queryClient.invalidateQueries({ queryKey: getGetSenseiDashboardQueryKey() }); } } });
  const connect = useConnectWhatsapp({ mutation: { onSuccess: (value) => queryClient.setQueryData(getGetWhatsappStatusQueryKey(), value) } });
  const disconnect = useDisconnectWhatsapp({ mutation: { onSuccess: (value) => { queryClient.setQueryData(getGetWhatsappStatusQueryKey(), value); queryClient.invalidateQueries({ queryKey: getGetSenseiDashboardQueryKey() }); } } });
  const [businessName, setBusinessName] = useState('');
  const [initialized, setInitialized] = useState(false);
  useEffect(() => { if (config.data && !initialized) { setBusinessName(config.data.businessName); setInitialized(true); } }, [config.data, initialized]);
  const onSave = (event: FormEvent) => {
    event.preventDefault();
    if (!config.data) return;
    save.mutate({ data: { businessName, useCase: config.data.useCase, description: config.data.description, systemPrompt: config.data.systemPrompt, welcomeMessage: config.data.welcomeMessage, tone: config.data.tone, isActive: config.data.isActive } });
  };
  return <AppShell active="/settings"><div className="page-wrap">
    <div className="page-heading"><div><div className="eyebrow">Workspace settings</div><h1>Business details and channels.</h1><p>Manage the business identity and the number customers message.</p></div></div>
    <div className="settings-layout">
      <form className="panel" onSubmit={onSave}><div className="panel-head"><div><h2>Business profile</h2><p>This name gives your assistant context about who it represents.</p></div><Building2 size={17} color="#658272"/></div><div className="panel-body">
        {config.isLoading && <div className="skeleton" style={{ height: 41 }}/>}
        {config.isError && <ErrorState message="Business profile could not be loaded." retry={() => config.refetch()}/>}
        {config.data && <><div className="field"><label htmlFor="settings-business-name">Business name</label><input id="settings-business-name" value={businessName} onChange={(event) => setBusinessName(event.target.value)} required maxLength={120} data-testid="input-settings-business-name"/></div><div className="field"><label>Assistant's role</label><div className="settings-note">Your assistant is set up for <strong>{formatUseCase(config.data.useCase)}</strong>. Change its role and detailed guidance on the Assistant page.</div></div><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}><span style={{ fontSize: 10, color: save.isSuccess ? '#438264' : '#8b969b' }}>{save.isSuccess ? 'Changes saved.' : 'Profile changes apply to your assistant.'}</span><button className="btn btn-primary" type="submit" disabled={save.isPending || businessName === config.data.businessName} data-testid="button-save-profile">{save.isPending ? 'Saving…' : 'Save profile'}</button></div>{save.isError && <div style={{ marginTop: 12 }}><ErrorState message="Could not save profile changes." retry={() => save.reset()}/></div>}</>}
      </div></form>
      <section className="panel"><div className="panel-head"><div><h2>WhatsApp connection</h2><p>Link the business number your customers use.</p></div><Phone size={16} color="#658272"/></div><div className="panel-body"><ConnectionSummary status={whatsapp.data} loading={whatsapp.isLoading} connecting={connect.isPending} disconnecting={disconnect.isPending} onConnect={() => connect.mutate()} onDisconnect={() => disconnect.mutate()} error={whatsapp.isError ? 'WhatsApp status could not be loaded.' : null}/><div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #edf0eb' }}><div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}><ShieldCheck size={16} color="#52866c" style={{ marginTop: 1 }}/><div><strong style={{ display: 'block', fontSize: 11, color: '#43534f', marginBottom: 5 }}>A secure link to your business number</strong><span style={{ fontSize: 10, color: '#83908f', lineHeight: 1.55 }}>Pairing happens through WhatsApp's QR flow. Your phone stays in control of the connection.</span></div></div></div></div></section>
    </div>
  </div></AppShell>;
}

function MarketingPage() {
  const { session, ready } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => { if (ready && session) setLocation('/dashboard'); }, [ready, session, setLocation]);
  return <div className="marketing">
    <header className="marketing-nav"><Logo/><nav className="marketing-links"><a href="#how-it-works">How it works</a><a href="#built-for-business">For your business</a><Link href="/login">Sign in</Link></nav><Link className="btn btn-primary btn-small" href="/login">Get started <ArrowRight size={13}/></Link></header>
    <section className="marketing-hero"><div className="hero-copy"><div className="hero-kicker">A calmer way to serve customers</div><h1>Your business,<br/>always <em>in conversation.</em></h1><p>Sensei gives your business a thoughtful WhatsApp assistant, built around the way your team works. Set its role, connect your number, and keep every customer conversation in view.</p><div className="hero-actions"><Link href="/login" className="btn btn-primary">Set up your assistant <ArrowRight size={15}/></Link><a href="#how-it-works" className="btn">See how it works</a></div><div className="hero-proof"><span><CheckCircle2 size={13}/>Designed for business teams</span><span><ShieldCheck size={13}/>Your number, your control</span></div></div>
      <div className="hero-art" aria-label="Illustration of a connected customer messaging workspace"><div className="hero-orbit"/><div className="hero-center"><Bot size={57} strokeWidth={1.5}/></div><div className="orbit-node node-a"><span className="mini-icon"><MessageCircle size={13}/></span><strong>Customer asks</strong></div><div className="orbit-node node-b"><span className="mini-icon"><Sparkles size={13}/></span><strong>Helpful answer</strong></div><div className="orbit-node node-c"><span className="mini-icon"><Users size={13}/></span><strong>Your team stays close</strong></div><div className="orbit-node node-d"><span className="mini-icon"><Wifi size={13}/></span><strong>WhatsApp connected</strong></div></div>
    </section>
    <div className="feature-band" id="built-for-business"><div className="section-eyebrow">A dependable daily tool</div><h2 className="section-title">Good service starts with a clear brief.</h2><p className="section-intro">An assistant should understand your business, know its limits, and make it easy for your people to stay in the loop.</p><div className="feature-grid"><article className="feature-card"><span className="mini-icon"><FileText size={17}/></span><h3>Set the right direction</h3><p>Give your assistant a role, useful business context, and a tone that sounds like your team.</p></article><article className="feature-card"><span className="mini-icon"><QrCode size={17}/></span><h3>Connect in a few steps</h3><p>Pair your business WhatsApp number securely with a QR code, then check connection health at a glance.</p></article><article className="feature-card"><span className="mini-icon"><MessageSquare size={17}/></span><h3>Keep customers in view</h3><p>See recent messages, open requests, and conversations that could use a human touch.</p></article></div></div>
    <section className="marketing-section" id="how-it-works"><div className="section-eyebrow">Up and running with clarity</div><h2 className="section-title">A simple setup. A more attentive inbox.</h2><p className="section-intro">No sprawling configuration. Just the details that help your assistant represent your business well.</p><div className="how-grid"><article className="how-step"><span className="step-num">01 / DEFINE</span><h3>Tell it what good help looks like</h3><p>Choose the work it should handle, add your business context, and write the practical guidance it needs.</p></article><article className="how-step"><span className="step-num">02 / CONNECT</span><h3>Link the number customers know</h3><p>Scan a QR code from WhatsApp on your phone. Sensei keeps you informed about its connection status.</p></article><article className="how-step"><span className="step-num">03 / UNDERSTAND</span><h3>See the conversation, not just a count</h3><p>Review customer messages, spot requests for your team, and measure how your service is responding.</p></article></div></section>
    <section className="quote-band"><blockquote>“The best assistant doesn't replace the personal touch. It helps your team deliver it more often.”</blockquote><p>THE SENSEI APPROACH</p></section>
    <section className="marketing-cta"><div className="section-eyebrow">Make your next reply count</div><h2>Let your WhatsApp work a little smarter.</h2><p>Set up a business assistant your team can understand and trust.</p><Link href="/login" className="btn btn-primary">Create your workspace <ArrowRight size={14}/></Link></section>
    <footer className="footer"><Logo/><span>Clear conversations. Thoughtful service.</span><div className="footer-links"><Link href="/login">Sign in</Link><a href="#how-it-works">How it works</a></div></footer>
  </div>;
}

function LoginPage() {
  const { session, ready, authError } = useAuth();
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { if (ready && session) setLocation('/dashboard'); }, [ready, session, setLocation]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    if (!supabase) { setError('Authentication is not configured. Add the Supabase environment variables to continue.'); return; }
    setBusy(true);
    const result = mode === 'signin' ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/login` } })
    setBusy(false);
    if (result.error) setError(result.error.message);
    else if (mode === 'signup' && !result.data.session) setMessage('Check your email for a confirmation link. After confirming, sign in to continue.');
    else setLocation('/dashboard');
  };
  return <div className="auth-page"><section className="auth-aside"><Logo/><div><div className="hero-kicker" style={{ color: '#a8ceb7' }}>Your customer conversations, together</div><h1>Make every customer feel <em>looked after.</em></h1><p>Sensei helps your business answer thoughtfully on WhatsApp, while keeping your team close to every conversation.</p></div><div className="auth-aside-note">A dependable workspace for the people behind your business.</div></section><main className="auth-form-side"><div className="auth-card"><Logo/><div className="eyebrow">Your business workspace</div><h2>{mode === 'signin' ? 'Welcome back.' : 'Start your workspace.'}</h2><p>{mode === 'signin' ? 'Sign in to continue to your Sensei workspace.' : 'Create an account for your business team.'}</p><div className="auth-tabs"><button className={`auth-tab ${mode === 'signin' ? 'active' : ''}`} onClick={() => { setMode('signin'); setError(''); setMessage(''); }} data-testid="tab-sign-in">Sign in</button><button className={`auth-tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => { setMode('signup'); setError(''); setMessage(''); }} data-testid="tab-create-account">Create account</button></div>
      {authError && <div className="error-box" style={{ marginBottom: 15 }}>{authError}</div>}{message && <div className="auth-feedback" data-testid="status-auth-message">{message}</div>}{error && <div className="error-box" style={{ marginBottom: 15 }} data-testid="status-auth-error">{error}</div>}
      <form onSubmit={submit}><div className="field"><label htmlFor="auth-email">Work email</label><input id="auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="you@business.com" data-testid="input-auth-email"/></div><div className="field"><label htmlFor="auth-password">Password</label><div className="password-wrap"><input id="auth-password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required placeholder="At least 6 characters" data-testid="input-auth-password"/><button type="button" className="password-toggle" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></div><button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 7, height: 43 }} disabled={busy} data-testid="button-auth-submit">{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in to Sensei' : 'Create business account'} <ArrowRight size={14}/></button></form><p className="auth-foot">By continuing, you agree to use Sensei responsibly and in line with WhatsApp's business messaging policies. Your business account is managed securely with Supabase.</p><Link href="/" className="btn btn-quiet btn-small" style={{ paddingLeft: 0 }}><ArrowDownRight size={13}/> Back to Sensei</Link></div></main></div>;
}

function Router() {
  return <Switch>
    <Route path="/" component={MarketingPage}/>
    <Route path="/login" component={LoginPage}/>
    <Route path="/dashboard"><Protected><DashboardPage/></Protected></Route>
    <Route path="/assistant"><Protected><AssistantPage/></Protected></Route>
    <Route path="/conversations"><Protected><ConversationsPage/></Protected></Route>
    <Route path="/settings"><Protected><SettingsPage/></Protected></Route>
    <Route component={NotFound}/>
  </Switch>;
}

function App() {
  return <QueryClientProvider client={queryClient}><AuthProvider><Router/></AuthProvider></QueryClientProvider>;
}

export default App;
