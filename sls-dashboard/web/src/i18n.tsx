import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Bilingual EN/AR with full RTL. The dictionary covers the app's own chrome;
 * program data (member names, initiative names, event titles) renders as entered,
 * with the Arabic column used where the data carries one (initiatives.name_ar,
 * council.role_ar, members.name_ar).
 */
const EN = {
  appName: 'SLS Data Center',
  org: 'Saudi Leadership Society',
  nav: { overview: 'Overview', members: 'Members', engagement: 'Engagement Hours', initiatives: 'Initiatives & Events', impact: 'Impact & Startups', social: 'Social Listening', ai: 'AI Reports', exports: 'Exports', ingest: 'Data Ingestion', council: 'Council Cockpit', settings: 'Settings' },
  filters: { title: 'Filters', dateRange: 'Date range', from: 'From', to: 'To', pillar: 'Pillar', initiative: 'Initiative', cohort: 'Cohort', sector: 'Sector', councilOwner: 'Council owner', hoursRange: 'Engagement hours', min: 'Min', max: 'Max', reset: 'Reset', apply: 'Apply', all: 'All', active: 'active', quick: 'Quick ranges', thisYear: 'This year', lastYear: 'Last year', last90: 'Last 90 days', allTime: 'All time' },
  kpi: { totalMembers: 'Total members', leaders2030: '2030 Leaders', miskFellows: 'Misk Fellows', onboarded: 'Members onboarded', totalHours: 'Engagement hours', avgHours: 'Avg hours / member', engagedMembers: 'Members engaged', autoShare: 'Auto-captured', events: 'Events held', attendees: 'Event attendees', satisfaction: 'Avg satisfaction', startups: 'Startups supported', recognised: 'Members recognised', verified: 'Hours verified' },
  chart: { table: 'Table', chart: 'Chart', noData: 'No data for the selected filters.', source: 'Source' },
  common: { search: 'Search', loading: 'Loading…', save: 'Save', cancel: 'Cancel', close: 'Close', delete: 'Delete', add: 'Add', edit: 'Edit', export: 'Export', download: 'Download', copy: 'Copy', copied: 'Copied', retry: 'Retry', of: 'of', showing: 'Showing', none: 'None', yes: 'Yes', no: 'No', back: 'Back', open: 'Open', more: 'more', verify: 'Verify', verified: 'Verified', unverified: 'Unverified', status: 'Status', actions: 'Actions', total: 'Total', hours: 'hours' },
  ai: { title: 'AI Analyst', ask: 'Ask about the data…', keyMissing: 'AI features are off', keyMissingBody: 'Add your Anthropic API key to switch on AI chat, AI-drafted reports, LinkedIn triage and recap captions.', addKey: 'Add API key', thinking: 'Analysing the data…', pinDashboard: 'Pin to dashboard', addReport: 'Add to report', pinned: 'Pinned', examples: 'Try asking', clear: 'New conversation', usedTools: 'Data used' },
  settings: { title: 'Settings', aiSection: 'AI (Anthropic API key)', apiKey: 'Anthropic API key', apiKeyHelp: 'Stored encrypted on this machine and never sent to the browser. Get a key at console.anthropic.com.', paste: 'Paste your key (sk-ant-…)', test: 'Test connection', saveKey: 'Save & activate', changeKey: 'Change key', removeKey: 'Remove key', model: 'Model', configured: 'Configured', notConfigured: 'Not configured', fromEnv: 'from environment variable', fromStored: 'stored in the app', rules: 'Engagement-hours rules', recognition: 'Recognition thresholds', brand: 'Brand tokens', socialSection: 'Social listening', anomalies: 'Anomaly thresholds', language: 'Language' },
  overview: {
    alertsTitle: 'Momentum & anomaly alerts',
    alertsSubtitle: 'Detected automatically: the last three complete months against the three before them',
    rerun: 'Re-run', acknowledge: 'Acknowledge',
    inPeriod: 'in the selected period', ofMembers: 'of members',
    perEngaged: 'per engaged member', metThreshold: 'met a recognition threshold',
    awaitingSignoff: 'entries awaiting sign-off', acrossEvents: 'across closed events',
    hoursOverTime: 'Engagement hours over time', hoursByPillar: 'Hours by pillar',
    hoursByActivity: 'Hours by activity type', hoursByCohort: 'Hours by cohort',
    activityNote: 'Activity types map to the engagement-hours rules table',
    initiativesTitle: 'Initiatives by engagement',
    initiativesSubtitle: 'Member reach = share of the society this initiative touched',
    leaderboardTitle: 'Engagement leaderboard',
    leaderboardSubtitle: 'Top members by logged hours in the selected period',
    pinnedTitle: 'Pinned from the AI analyst',
    noData: 'No data yet',
    noDataBody: 'Load the seed dataset with `npm run db:reset`, or import your own via Data Ingestion.',
    goIngest: 'Go to ingestion',
    colInitiative: 'Initiative', colPillar: 'Pillar', colHours: 'Hours', colEvents: 'Events',
    colReach: 'Reach', colMember: 'Member', colCohort: 'Cohort',
  },
  lang: { en: 'English', ar: 'العربية' },
};

type Dict = typeof EN;

const AR: Dict = {
  appName: 'مركز بيانات جمعية القيادات',
  org: 'جمعية القيادات السعودية',
  nav: { overview: 'نظرة عامة', members: 'الأعضاء', engagement: 'ساعات المشاركة', initiatives: 'المبادرات والفعاليات', impact: 'الأثر والشركات الناشئة', social: 'الرصد الاجتماعي', ai: 'تقارير الذكاء الاصطناعي', exports: 'التصدير', ingest: 'إدخال البيانات', council: 'لوحة المجلس', settings: 'الإعدادات' },
  filters: { title: 'عوامل التصفية', dateRange: 'النطاق الزمني', from: 'من', to: 'إلى', pillar: 'المحور', initiative: 'المبادرة', cohort: 'الفوج', sector: 'القطاع', councilOwner: 'مالك المجلس', hoursRange: 'ساعات المشاركة', min: 'الأدنى', max: 'الأعلى', reset: 'إعادة تعيين', apply: 'تطبيق', all: 'الكل', active: 'مفعّل', quick: 'نطاقات سريعة', thisYear: 'هذا العام', lastYear: 'العام الماضي', last90: 'آخر ٩٠ يومًا', allTime: 'كل الفترات' },
  kpi: { totalMembers: 'إجمالي الأعضاء', leaders2030: 'قادة ٢٠٣٠', miskFellows: 'زمالة مسك', onboarded: 'الأعضاء المنضمون', totalHours: 'ساعات المشاركة', avgHours: 'متوسط الساعات لكل عضو', engagedMembers: 'الأعضاء المشاركون', autoShare: 'مُحتسب تلقائيًا', events: 'الفعاليات المنفذة', attendees: 'حضور الفعاليات', satisfaction: 'متوسط الرضا', startups: 'الشركات الناشئة المدعومة', recognised: 'الأعضاء المكرّمون', verified: 'الساعات المعتمدة' },
  chart: { table: 'جدول', chart: 'رسم بياني', noData: 'لا توجد بيانات ضمن عوامل التصفية المحددة.', source: 'المصدر' },
  common: { search: 'بحث', loading: 'جارٍ التحميل…', save: 'حفظ', cancel: 'إلغاء', close: 'إغلاق', delete: 'حذف', add: 'إضافة', edit: 'تعديل', export: 'تصدير', download: 'تنزيل', copy: 'نسخ', copied: 'تم النسخ', retry: 'إعادة المحاولة', of: 'من', showing: 'عرض', none: 'لا شيء', yes: 'نعم', no: 'لا', back: 'رجوع', open: 'فتح', more: 'المزيد', verify: 'اعتماد', verified: 'معتمد', unverified: 'غير معتمد', status: 'الحالة', actions: 'إجراءات', total: 'الإجمالي', hours: 'ساعة' },
  ai: { title: 'محلل الذكاء الاصطناعي', ask: 'اسأل عن البيانات…', keyMissing: 'ميزات الذكاء الاصطناعي معطّلة', keyMissingBody: 'أضف مفتاح Anthropic API لتفعيل المحادثة الذكية والتقارير المصاغة آليًا وفرز منشورات لينكدإن وتعليقات البطاقات.', addKey: 'إضافة مفتاح API', thinking: 'جارٍ تحليل البيانات…', pinDashboard: 'تثبيت في اللوحة', addReport: 'إضافة إلى التقرير', pinned: 'مثبّت', examples: 'جرّب أن تسأل', clear: 'محادثة جديدة', usedTools: 'البيانات المستخدمة' },
  settings: { title: 'الإعدادات', aiSection: 'الذكاء الاصطناعي (مفتاح Anthropic API)', apiKey: 'مفتاح Anthropic API', apiKeyHelp: 'يُخزَّن مشفّرًا على هذا الجهاز ولا يُرسل إلى المتصفح مطلقًا. احصل على مفتاح من console.anthropic.com.', paste: 'الصق المفتاح (sk-ant-…)', test: 'اختبار الاتصال', saveKey: 'حفظ وتفعيل', changeKey: 'تغيير المفتاح', removeKey: 'إزالة المفتاح', model: 'النموذج', configured: 'مُهيّأ', notConfigured: 'غير مُهيّأ', fromEnv: 'من متغير البيئة', fromStored: 'مخزّن في التطبيق', rules: 'قواعد ساعات المشاركة', recognition: 'حدود التكريم', brand: 'رموز الهوية البصرية', socialSection: 'الرصد الاجتماعي', anomalies: 'حدود الإنذارات', language: 'اللغة' },
  overview: {
    alertsTitle: 'إنذارات الزخم والانحرافات',
    alertsSubtitle: 'تُرصد تلقائيًا: آخر ثلاثة أشهر مكتملة مقارنةً بالثلاثة التي تسبقها',
    rerun: 'إعادة الفحص', acknowledge: 'تم الاطلاع',
    inPeriod: 'خلال الفترة المحددة', ofMembers: 'من الأعضاء',
    perEngaged: 'لكل عضو مشارك', metThreshold: 'بلغوا حد التكريم',
    awaitingSignoff: 'إدخالًا بانتظار الاعتماد', acrossEvents: 'عبر الفعاليات المنتهية',
    hoursOverTime: 'ساعات المشاركة عبر الزمن', hoursByPillar: 'الساعات حسب المحور',
    hoursByActivity: 'الساعات حسب نوع النشاط', hoursByCohort: 'الساعات حسب الفوج',
    activityNote: 'ترتبط أنواع الأنشطة بجدول قواعد ساعات المشاركة',
    initiativesTitle: 'المبادرات حسب المشاركة',
    initiativesSubtitle: 'نسبة الوصول = حصة الأعضاء الذين لامستهم هذه المبادرة',
    leaderboardTitle: 'لوحة صدارة المشاركة',
    leaderboardSubtitle: 'الأعضاء الأكثر تسجيلًا للساعات خلال الفترة المحددة',
    pinnedTitle: 'مثبّت من محلل الذكاء الاصطناعي',
    noData: 'لا توجد بيانات بعد',
    noDataBody: 'حمّل البيانات التجريبية بالأمر npm run db:reset، أو استورد بياناتك من صفحة إدخال البيانات.',
    goIngest: 'انتقل إلى إدخال البيانات',
    colInitiative: 'المبادرة', colPillar: 'المحور', colHours: 'الساعات', colEvents: 'الفعاليات',
    colReach: 'الوصول', colMember: 'العضو', colCohort: 'الفوج',
  },
  lang: { en: 'English', ar: 'العربية' },
};

export type Lang = 'en' | 'ar';
const DICTS: Record<Lang, Dict> = { en: EN, ar: AR };

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: Dict; dir: 'ltr' | 'rtl' }>({
  lang: 'en', setLang: () => {}, t: EN, dir: 'ltr',
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('sls-lang') as Lang) || 'en');
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    localStorage.setItem('sls-lang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const value = useMemo(() => ({ lang, setLang, t: DICTS[lang], dir: dir as 'ltr' | 'rtl' }), [lang, dir]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
