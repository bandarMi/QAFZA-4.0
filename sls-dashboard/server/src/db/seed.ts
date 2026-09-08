/**
 * Seed the SLS Data Center.
 *
 * PROVENANCE / HONESTY NOTE
 * -------------------------
 * Headline totals (974 members = 611 "2030 Leaders" + 363 "Misk Fellows", 331
 * onboarded, 180+ startups supported, 13,000+ event attendees, 29+ members
 * recognised), the three pillars, the four values, the eleven initiatives and the
 * six council roles come from the program brief supplied by the program owner.
 *
 * They could NOT be re-verified against the SLS Impact Report PDF: this build
 * environment's egress proxy blocks every misk.org.sa host. See
 * docs/DESIGN_TOKENS_REPORT.md.
 *
 * Every *person-level* row below (names, companies, titles, LinkedIn URLs,
 * emails, individual events, individual startups, individual posts) is
 * SYNTHETIC DEMO DATA generated here so the dashboard is clickable end-to-end.
 * It is sized and shaped to match the real headline totals. Replace it with real
 * data via Ingestion → CSV upload; `npm run db:reset` rebuilds this seed.
 */
import { db } from './index.js';
import { postHoursForEvent } from '../lib/engagement.js';
import { evaluateRecognition } from '../lib/recognition.js';

// Deterministic PRNG so reseeding gives a stable dataset.
let _s = 20300611;
const rnd = () => ((_s = (_s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const chance = (p: number) => rnd() < p;

const FIRST_M = ['Abdullah','Mohammed','Faisal','Khalid','Sultan','Omar','Yousef','Saud','Bandar','Turki','Nasser','Ziad','Majed','Rayan','Hatim','Ibrahim','Salman','Fahad','Anas','Waleed','Tariq','Musaed','Hassan','Ammar'];
const FIRST_F = ['Noura','Sara','Lama','Reem','Haya','Aljohara','Maha','Dana','Rana','Ghada','Shatha','Mona','Layan','Amal','Jood','Hind','Wijdan','Asma','Rawan','Bushra','Nada','Leen','Arwa','Manal'];
const LAST = ['Al-Rashid','Al-Otaibi','Al-Harbi','Al-Qahtani','Al-Ghamdi','Al-Zahrani','Al-Shehri','Al-Dossary','Al-Mutairi','Al-Anazi','Al-Subaie','Al-Juhani','Al-Amri','Al-Balawi','Al-Sudairi','Al-Turki','Al-Fadl','Al-Hamdan','Al-Nasser','Al-Rajhi','Bin Mahfouz','Al-Sheikh','Al-Barrak','Al-Suwaidi'];
const SECTORS = ['Technology','Healthcare','Education','Energy','Financial Services','Government','Tourism & Culture','Logistics','Non-profit','Media & Entertainment','Manufacturing','Real Estate'];
const COMPANIES: Record<string,string[]> = {
  'Technology': ['stc','Elm','Thiqah','Lean Technologies','Salla','Tamara','Unifonic'],
  'Healthcare': ['Ministry of Health','Dr. Sulaiman Al Habib','Nupco','Seha Virtual Hospital','Lean'],
  'Education': ['KAUST','KAUST Innovation','Misk Schools','King Saud University','Alfaisal University'],
  'Energy': ['Saudi Aramco','ACWA Power','SABIC','Saudi Electricity Company','NEOM Energy'],
  'Financial Services': ['SNB Capital','Riyad Bank','SAMA','Jadwa Investment','Tadawul','SVC'],
  'Government': ['Ministry of Economy & Planning','PIF','Royal Commission','MCIT','GASTAT'],
  'Tourism & Culture': ['Diriyah Gate','Red Sea Global','Ministry of Culture','Saudi Tourism Authority'],
  'Logistics': ['Bahri','SAL','Saudi Ports Authority','Zajil','Mowasalat'],
  'Non-profit': ['Misk Foundation','King Khalid Foundation','Alwaleed Philanthropies','Ehsan'],
  'Media & Entertainment': ['MBC Group','SRMG','Manga Productions','Qiddiya'],
  'Manufacturing': ['SABIC','Alfanar','Al Yamamah Steel','Astra Industrial'],
  'Real Estate': ['ROSHN','NHC','Dar Al Arkan','Emaar EC'],
};
const TITLES = ['Senior Manager','Director','Program Lead','Head of Strategy','Vice President','Founder & CEO','Principal Consultant','Chief of Staff','Product Lead','General Manager','Policy Advisor','Engineering Manager'];
const REGIONS = ['Riyadh','Makkah','Eastern Province','Madinah','Asir','Qassim','Tabuk','Hail'];

const PILLARS = [
  ['Grow to Great',      'Personal growth: capability building, learning and mastery for every member.', 1],
  ['Connect to Create',  'Connection: lifelong relationships across sectors that spark new ventures and ideas.', 2],
  ['Lead with Impact',   'Collective impact: leadership applied to socio-economic outcomes for Vision 2030.', 3],
] as const;

const VALUES = [
  ['Authenticity', 'Leading as your true self, with integrity.', 1],
  ['Collaboration','Advancing together across sectors and cohorts.', 2],
  ['Ownership',    'Taking responsibility for outcomes, not just activity.', 3],
  ['Impact',       'Measuring success by the change we create.', 4],
] as const;

const COUNCIL_ROLES = [
  'Chair','Vice Chair','Finance & Growth Lead','Governance Lead','Engagement & Impact Lead','Strategic Positioning Lead',
] as const;
const COUNCIL_ROLES_AR: Record<string,string> = {
  'Chair':'الرئيس','Vice Chair':'نائب الرئيس','Finance & Growth Lead':'قائد المالية والنمو',
  'Governance Lead':'قائد الحوكمة','Engagement & Impact Lead':'قائد المشاركة والأثر','Strategic Positioning Lead':'قائد التموضع الاستراتيجي',
};

/** The 11 tracked initiatives, mapped to pillar + owning council role. */
const INITIATIVES: Array<[string,string,string,string,number,string,string]> = [
  // name, name_ar, pillar, owner_council_role, recurring, cadence, description
  ['Leadership Toolkit','حقيبة القيادة','Grow to Great','Strategic Positioning Lead',1,'monthly','Practical frameworks, playbooks and micro-learning released to all members.'],
  ['Voice of the Leaders','صوت القادة','Grow to Great','Engagement & Impact Lead',1,'monthly','Member-led talks and podcast sessions surfacing lived leadership lessons.'],
  ['Topic Clubs','أندية الموضوعات','Connect to Create','Engagement & Impact Lead',1,'bi-weekly','Small standing groups convening around a shared professional topic.'],
  ['Transformational Experiences','التجارب التحويلية','Grow to Great','Chair',0,'quarterly','Immersive multi-day experiences designed to shift perspective.'],
  ['Mentorship','الإرشاد','Grow to Great','Vice Chair',1,'ongoing','Structured mentor/mentee pairings across cohorts and sectors.'],
  ['Annual Assembly','الملتقى السنوي','Connect to Create','Chair',1,'annual','The flagship full-day gathering of the whole society.'],
  ['SLS Networking','التواصل','Connect to Create','Engagement & Impact Lead',1,'monthly','Curated cross-sector networking meetups in each region.'],
  ['Leaders Lens','عدسة القادة','Connect to Create','Strategic Positioning Lead',1,'monthly','Member storytelling and visual features published to the community.'],
  ['Meet the Leader','لقاء القائد','Connect to Create','Vice Chair',1,'monthly','Fireside sessions with senior national and global leaders.'],
  ['Annual Impact Challenge','تحدي الأثر السنوي','Lead with Impact','Governance Lead',1,'annual','Team-based challenge turning member ideas into measurable impact projects.'],
  ['Volunteering Opportunities','فرص التطوع','Lead with Impact','Finance & Growth Lead',1,'ongoing','Brokered volunteering placements contributing measurable community hours.'],
];

/** Activity type -> default hours. Editable in the UI; no code change needed. */
const RULES: Array<[string,number,Record<string,number>,number,string]> = [
  ['event attendance',    2.0, { speaker: 1.5, organiser: 2.0, judge: 1.25 }, 1, 'Default for any event with no more specific rule. Overridden by the event’s own duration_hours.'],
  ['topic club',          1.5, { organiser: 1.5 },                            1, 'One standing Topic Club session.'],
  ['mentorship session',  1.0, { mentor: 1.0 },                               1, 'One mentor/mentee session. Logged for both sides (given / received).'],
  ['volunteering',        3.0, { organiser: 1.25 },                           1, 'One brokered volunteering slot.'],
  ['council duty',        2.0, {},                                            1, 'Council meeting or governance duty.'],
  ['content contribution',1.5, {},                                            1, 'Article, toolkit entry, Leaders Lens feature or podcast recording.'],
];

export function seed() {
  const tables = ['engagement_audit','engagement_logs','event_attendance','events','challenge_scores','challenge_submissions','recognition_flags','recognition_rules','engagement_rules','linkedin_mentions','startups','impact_metrics','council','initiatives','members','pillars','values_ref','alerts','pinned_widgets','ai_messages','ai_conversations','import_jobs'];
  db.exec('PRAGMA foreign_keys = OFF');
  for (const t of tables) db.exec(`DELETE FROM ${t}; DELETE FROM sqlite_sequence WHERE name='${t}';`);
  db.exec('PRAGMA foreign_keys = ON');

  const tx = db.transaction(() => {
    // ---- reference data -----------------------------------------------------
    const insPillar = db.prepare('INSERT INTO pillars (name, description, sort_order) VALUES (?,?,?)');
    for (const [n, d, o] of PILLARS) insPillar.run(n, d, o);
    const insValue = db.prepare('INSERT INTO values_ref (name, description, sort_order) VALUES (?,?,?)');
    for (const [n, d, o] of VALUES) insValue.run(n, d, o);

    const insRule = db.prepare('INSERT INTO engagement_rules (activity_type, default_hours, role_multiplier, counts_toward_recognition, description) VALUES (?,?,?,?,?)');
    for (const [a, h, m, c, d] of RULES) insRule.run(a, h, JSON.stringify(m), c, d);

    db.prepare('INSERT INTO recognition_rules (name, name_ar, threshold_hours, period, active) VALUES (?,?,?,?,1)')
      .run('Impact Circle (50+ hours / year)', 'دائرة الأثر (٥٠+ ساعة سنويًا)', 50, 'calendar_year');
    db.prepare('INSERT INTO recognition_rules (name, name_ar, threshold_hours, period, active) VALUES (?,?,?,?,1)')
      .run('Community Builder (100+ hours / year)', 'باني المجتمع (١٠٠+ ساعة سنويًا)', 100, 'calendar_year');
    db.prepare('INSERT INTO recognition_rules (name, name_ar, threshold_hours, period, active) VALUES (?,?,?,?,1)')
      .run('Lifetime Contributor (250+ hours)', 'المساهم المتميز (٢٥٠+ ساعة)', 250, 'all_time');

    // ---- members: 974 = 611 "2030 Leaders" + 363 "Misk Fellows" -------------
    const insMember = db.prepare(`INSERT INTO members
      (member_code,name,name_ar,cohort_type,cohort_year,join_date,graduation_date,sector,company,title,email,region,linkedin_url,status,tags)
      VALUES (@member_code,@name,@name_ar,@cohort_type,@cohort_year,@join_date,@graduation_date,@sector,@company,@title,@email,@region,@linkedin_url,@status,@tags)`);

    const total2030 = 611, totalFellows = 363;
    const memberIds: number[] = [];
    let n = 0;
    for (const [cohort, count] of [['2030 Leader', total2030], ['Misk Fellow', totalFellows]] as const) {
      for (let i = 0; i < count; i++) {
        n++;
        const female = chance(0.42);
        const first = female ? pick(FIRST_F) : pick(FIRST_M);
        const last = pick(LAST);
        const sector = pick(SECTORS);
        const gradYear = int(2019, 2025);
        // 331 members were onboarded in the current reporting period (2026).
        const onboardedThisPeriod = n <= 331;
        const joinYear = onboardedThisPeriod ? 2026 : int(2021, 2025);
        const joinMonth = onboardedThisPeriod ? int(1, 8) : int(1, 12);
        const slug = `${first}-${last}`.toLowerCase().replace(/[^a-z-]/g, '');
        const r = insMember.run({
          member_code: `SLS-${String(n).padStart(4, '0')}`,
          name: `${first} ${last}`,
          name_ar: null,
          cohort_type: cohort,
          cohort_year: gradYear,
          join_date: `${joinYear}-${String(joinMonth).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`,
          graduation_date: `${gradYear}-${String(int(1, 12)).padStart(2, '0')}-15`,
          sector,
          company: pick(COMPANIES[sector]!),
          title: pick(TITLES),
          email: `${slug}.${n}@example.sa`,
          region: chance(0.55) ? 'Riyadh' : pick(REGIONS),
          linkedin_url: `https://www.linkedin.com/in/${slug}-${n}`,
          status: chance(0.93) ? 'active' : pick(['inactive', 'paused', 'alumni']),
          tags: JSON.stringify(['demo-data', sector]),
        });
        memberIds.push(Number(r.lastInsertRowid));
      }
    }

    // Mentor pairings: ~22% of members have a mentor drawn from earlier cohorts.
    const setMentor = db.prepare('UPDATE members SET mentor_id=? WHERE id=?');
    for (const id of memberIds) {
      if (chance(0.22)) {
        const m = pick(memberIds.slice(0, Math.max(1, Math.floor(memberIds.length * 0.4))));
        if (m !== id) setMentor.run(m, id);
      }
    }

    // ---- council ------------------------------------------------------------
    const insCouncil = db.prepare('INSERT INTO council (member_id,name,role,role_ar,term_start,term_end,linkedin_url,active) VALUES (?,?,?,?,?,?,?,1)');
    const getMember = db.prepare('SELECT id, name, linkedin_url FROM members WHERE id=?');
    COUNCIL_ROLES.forEach((role, i) => {
      const m = getMember.get(memberIds[i * 37]!) as any;
      insCouncil.run(m.id, m.name, role, COUNCIL_ROLES_AR[role], '2025-01-01', '2026-12-31', m.linkedin_url);
    });

    // ---- initiatives --------------------------------------------------------
    const insInit = db.prepare('INSERT INTO initiatives (name,name_ar,pillar,description,owner_council_role,recurring_flag,cadence) VALUES (?,?,?,?,?,?,?)');
    const initIds: Record<string, number> = {};
    for (const [name, nameAr, pillar, owner, rec, cadence, desc] of INITIATIVES) {
      const r = insInit.run(name, nameAr, pillar, desc, owner, rec, cadence);
      initIds[name] = Number(r.lastInsertRowid);
    }

    // ---- events -------------------------------------------------------------
    // Shaped so total attendee_count lands just over the 13,000 headline.
    const insEvent = db.prepare(`INSERT INTO events
      (initiative_id,name,name_ar,date,attendee_count,location,type,satisfaction_score,duration_hours,activity_type,status,checkin_token)
      VALUES (@initiative_id,@name,@name_ar,@date,@attendee_count,@location,@type,@satisfaction_score,@duration_hours,@activity_type,@status,@checkin_token)`);

    const eventPlan: Record<string, { perYear: number; hours: number; size: [number, number]; activity: string }> = {
      'Leadership Toolkit':            { perYear: 12, hours: 1.5, size: [40, 120],  activity: 'content contribution' },
      'Voice of the Leaders':          { perYear: 10, hours: 1.5, size: [50, 160],  activity: 'event attendance' },
      'Topic Clubs':                   { perYear: 24, hours: 1.5, size: [12, 35],   activity: 'topic club' },
      'Transformational Experiences':  { perYear: 4,  hours: 16,  size: [25, 45],   activity: 'event attendance' },
      'Mentorship':                    { perYear: 30, hours: 1,   size: [2, 2],     activity: 'mentorship session' },
      'Annual Assembly':               { perYear: 1,  hours: 8,   size: [420, 620], activity: 'event attendance' },
      'SLS Networking':                { perYear: 12, hours: 3,   size: [45, 130],  activity: 'event attendance' },
      'Leaders Lens':                  { perYear: 12, hours: 1,   size: [20, 60],   activity: 'content contribution' },
      'Meet the Leader':               { perYear: 10, hours: 2,   size: [70, 210],  activity: 'event attendance' },
      'Annual Impact Challenge':       { perYear: 3,  hours: 6,   size: [60, 140],  activity: 'event attendance' },
      'Volunteering Opportunities':    { perYear: 14, hours: 4,   size: [15, 50],   activity: 'volunteering' },
    };

    const TODAY = '2026-09-08';
    const eventIds: number[] = [];
    for (const [initName, plan] of Object.entries(eventPlan)) {
      for (const year of [2024, 2025, 2026]) {
        const count = year === 2026 ? Math.ceil(plan.perYear * 0.7) : plan.perYear;
        for (let i = 0; i < count; i++) {
          const month = year === 2026 ? int(1, 9) : int(1, 12);
          const date = `${year}-${String(month).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`;
          const past = date <= TODAY;
          // Gentle growth year over year.
          const growth = year === 2024 ? 0.82 : year === 2025 ? 1.0 : 1.12;
          const size = Math.round(int(plan.size[0], plan.size[1]) * growth * 0.72);
          const r = insEvent.run({
            initiative_id: initIds[initName]!,
            name: `${initName} — ${date}`,
            name_ar: null,
            date,
            attendee_count: size,
            location: plan.activity === 'mentorship session' ? 'Virtual' : pick(REGIONS),
            type: chance(0.55) ? 'in-person' : chance(0.5) ? 'virtual' : 'hybrid',
            satisfaction_score: past ? Math.round((3.9 + rnd() * 1.05) * 10) / 10 : null,
            duration_hours: plan.hours,
            activity_type: plan.activity,
            status: past ? 'closed' : 'planned',
            checkin_token: `evt_${Math.floor(rnd() * 1e12).toString(36)}${eventIds.length}`,
          });
          eventIds.push(Number(r.lastInsertRowid));
        }
      }
    }

    // ---- attendance ---------------------------------------------------------
    // Link a realistic slice of each event's headline attendance to named members
    // (the rest of the headcount is external/unlinked guests, as in real life).
    const insAtt = db.prepare('INSERT OR IGNORE INTO event_attendance (event_id,member_id,registered_at,checked_in_at,checked_out_at,role,source,no_show) VALUES (?,?,?,?,?,?,?,?)');
    const allEvents = db.prepare('SELECT id,date,attendee_count,duration_hours,status,activity_type FROM events').all() as any[];

    // Weight members so engagement is realistically uneven (a committed core).
    const weighted: number[] = [];
    memberIds.forEach((id, i) => {
      const w = i % 13 === 0 ? 28 : i % 4 === 0 ? 5 : 1;
      for (let k = 0; k < w; k++) weighted.push(id);
    });

    for (const ev of allEvents) {
      if (ev.status !== 'closed') continue;
      const linked = Math.max(2, Math.min(ev.attendee_count, Math.round(ev.attendee_count * (0.35 + rnd() * 0.4))));
      const chosen = new Set<number>();
      let guard = 0;
      while (chosen.size < linked && guard++ < linked * 12) chosen.add(pick(weighted));
      for (const mid of chosen) {
        const noShow = chance(0.07) ? 1 : 0;
        const inAt = noShow ? null : `${ev.date}T${String(int(8, 17)).padStart(2, '0')}:${pick(['00','05','10','15','20','30','45'])}:00`;
        // ~30% of check-ins have no check-out scan -> engine falls back to default duration.
        const outAt = inAt && !chance(0.3)
          ? `${ev.date}T${String(Math.min(23, int(9, 19))).padStart(2, '0')}:${pick(['00','15','30','45'])}:00`
          : null;
        const role = ev.activity_type === 'mentorship session'
          ? (chance(0.5) ? 'mentor' : 'mentee')
          : chance(0.04) ? 'speaker' : chance(0.05) ? 'organiser' : chance(0.03) ? 'volunteer' : 'attendee';
        insAtt.run(ev.id, mid, `${ev.date}T07:00:00`, inAt, outAt, role, chance(0.6) ? 'qr' : 'manual', noShow);
      }
    }

    // ---- startups (186, representing the "180+ supported" headline) ----------
    const insStartup = db.prepare('INSERT INTO startups (member_id,name,sector,funding_stage,support_type,outcome_metric,outcome_value,support_year) VALUES (?,?,?,?,?,?,?,?)');
    const STAGES = ['idea','pre-seed','seed','series-a','growth'];
    const SUPPORT = ['mentorship','funding','market access','training','network introductions'];
    const PREFIX = ['Nafath','Tamkeen','Rawaf','Bunyan','Masar','Qimam','Wattan','Sahab','Jusoor','Mostaqbal','Nokhba','Ufuq','Marsa','Tayf','Hasad'];
    const SUFFIX = ['Labs','Tech','Health','Analytics','Ventures','Logistics','Learning','Energy','Studio','Systems'];
    for (let i = 0; i < 186; i++) {
      const sector = pick(SECTORS);
      insStartup.run(
        pick(memberIds), `${pick(PREFIX)} ${pick(SUFFIX)}`, sector, pick(STAGES), pick(SUPPORT),
        pick(['jobs created','users reached','revenue (SAR)','funding raised (SAR)']),
        int(3, 250) * 1000, int(2023, 2026),
      );
    }

    // ---- impact metrics (headline figures from the program brief) -----------
    const insMetric = db.prepare('INSERT OR REPLACE INTO impact_metrics (period,metric_name,value,unit,source,notes) VALUES (?,?,?,?,?,?)');
    const brief = 'From the program brief supplied by the program owner. NOT re-verified against the SLS Impact Report PDF — that host is blocked by this environment’s network policy.';
    insMetric.run('all-time','Total members',974,'members','impact-report',brief);
    insMetric.run('all-time','2030 Leaders',611,'members','impact-report',brief);
    insMetric.run('all-time','Misk Fellows',363,'members','impact-report',brief);
    insMetric.run('2026','Members onboarded',331,'members','impact-report',brief);
    insMetric.run('all-time','Startups supported',186,'startups','computed','Computed from the startups table.');
    insMetric.run('all-time','Event attendees',13000,'attendees','impact-report',brief);
    insMetric.run('all-time','Members recognised',29,'members','impact-report',brief);

    // ---- LinkedIn mentions (layer-2 style captures) -------------------------
    const insMention = db.prepare('INSERT OR IGNORE INTO linkedin_mentions (member_id,author_name,post_url,post_date,content_snippet,engagement_count,sls_relevance_score,matched_keywords,status,capture_source,priority_flag) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    const SNIPPETS = [
      'Proud to have joined the Saudi Leadership Society Annual Assembly this week — the energy in the room around Vision 2030 was unmatched.',
      'Grateful to Misk Foundation and the SLS community for the mentorship that shaped this milestone.',
      'Wrapped up another Topic Club session with the Saudi Leadership Society. Cross-sector conversation at its best.',
      'Sharing what I learned leading a volunteering drive with SLS members this month.',
      'Honoured to speak at Meet the Leader, hosted by the Saudi Leadership Society.',
      'Our Impact Challenge team just closed its pilot. Thank you SLS for the platform.',
    ];
    for (let i = 0; i < 42; i++) {
      const mid = pick(memberIds);
      const m = getMember.get(mid) as any;
      const snippet = pick(SNIPPETS);
      const kws = ['SLS','Saudi Leadership Society','Misk'].filter(k => snippet.includes(k));
      insMention.run(
        mid, m.name, `https://www.linkedin.com/posts/demo-${i}-${Math.floor(rnd() * 1e6)}`,
        `2026-${String(int(1, 9)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`,
        snippet, int(12, 940), Math.min(100, 30 + kws.length * 22 + int(0, 12)),
        JSON.stringify(kws), pick(['new','new','reviewed','shared']), 'manual', chance(0.18) ? 1 : 0,
      );
    }

    // ---- Impact Challenge ---------------------------------------------------
    const insSub = db.prepare('INSERT INTO challenge_submissions (year,member_id,team_name,project_title,summary,pillar,status) VALUES (?,?,?,?,?,?,?)');
    const insScore = db.prepare('INSERT INTO challenge_scores (submission_id,criterion,score,weight,judge) VALUES (?,?,?,?,?)');
    const CRITERIA: Array<[string, number]> = [['Impact', 0.4], ['Feasibility', 0.25], ['Innovation', 0.2], ['Alignment', 0.15]];
    const PROJECTS = ['Green Corridor Riyadh','Skills Bridge for Youth','Rural Telehealth Access','Circular Packaging Pilot','Heritage Craft Marketplace','SME Export Accelerator','Neurodiversity at Work','Water Reuse for Farms','Coding Camps for Girls','Last-Mile Logistics Co-op','Mental Health First Aid','Solar for Schools'];
    for (const year of [2025, 2026]) {
      const count = year === 2026 ? 12 : 9;
      for (let i = 0; i < count; i++) {
        const r = insSub.run(
          year, pick(memberIds), `Team ${pick(PREFIX)}`, PROJECTS[i % PROJECTS.length]!,
          'Member-led project submitted to the Annual Impact Challenge.',
          pick(PILLARS.map(p => p[0])),
          year === 2025 ? (i === 0 ? 'winner' : i < 3 ? 'finalist' : 'submitted') : (i < 4 ? 'shortlisted' : 'submitted'),
        );
        for (const [c, w] of CRITERIA) {
          insScore.run(Number(r.lastInsertRowid), c, Math.round((5.5 + rnd() * 4.4) * 10) / 10, w, `Judge ${int(1, 4)}`);
        }
      }
    }
  });

  tx();

  // ---- run the hours engine over every closed event -------------------------
  // Hours are NOT seeded directly: they are produced by the same engine the app
  // uses at runtime, so the seed proves the automation works.
  const closed = db.prepare("SELECT id FROM events WHERE status='closed'").all() as Array<{ id: number }>;
  for (const e of closed) postHoursForEvent(e.id, 'seed');

  // Council duty + a spread of manual/imported entries for audit-trail realism.
  const councilMembers = db.prepare('SELECT member_id FROM council WHERE member_id IS NOT NULL').all() as any[];
  const insLog = db.prepare(`INSERT OR IGNORE INTO engagement_logs
    (member_id,activity_type,related_initiative_id,related_event_id,date,hours,direction,source,verified_flag,notes)
    VALUES (?,?,NULL,NULL,?,?,'participated',?,?,?)`);
  for (const c of councilMembers) {
    for (const year of [2025, 2026]) {
      const months = year === 2026 ? 9 : 12;
      for (let m = 1; m <= months; m++) {
        insLog.run(c.member_id, 'council duty', `${year}-${String(m).padStart(2, '0')}-10`, 2,
          'manual', 1, 'Monthly council meeting');
      }
    }
  }

  evaluateRecognition();

  const counts = Object.fromEntries(
    ['members','initiatives','events','event_attendance','engagement_logs','startups','linkedin_mentions','challenge_submissions','recognition_flags']
      .map(t => [t, (db.prepare(`SELECT COUNT(*) c FROM ${t}`).get() as any).c]),
  );
  return counts;
}
