/**
 * Recognition thresholds: configurable milestone rules that auto-flag members.
 * Feeds the "members identified / recognised" reporting metric.
 */
import { db } from '../db/index.js';

export function evaluateRecognition() {
  const rules = db.prepare('SELECT * FROM recognition_rules WHERE active=1').all() as any[];
  const ins = db.prepare(`INSERT OR IGNORE INTO recognition_flags
    (member_id, rule_id, period_label, hours_at_flag) VALUES (?,?,?,?)`);
  const upd = db.prepare('UPDATE recognition_flags SET hours_at_flag=? WHERE member_id=? AND rule_id=? AND period_label=?');

  let flagged = 0;
  const tx = db.transaction(() => {
    for (const rule of rules) {
      let rows: any[] = [];
      const cohortClause = rule.cohort_filter ? 'AND m.cohort_type = @cohort' : '';
      const params: any = { threshold: rule.threshold_hours, cohort: rule.cohort_filter };

      if (rule.period === 'all_time') {
        rows = db.prepare(`
          SELECT l.member_id, 'all-time' period_label, ROUND(SUM(l.hours),2) hours
          FROM engagement_logs l JOIN members m ON m.id = l.member_id
          WHERE 1=1 ${cohortClause}
          GROUP BY l.member_id HAVING SUM(l.hours) >= @threshold`).all(params) as any[];
      } else if (rule.period === 'calendar_year') {
        rows = db.prepare(`
          SELECT l.member_id, substr(l.date,1,4) period_label, ROUND(SUM(l.hours),2) hours
          FROM engagement_logs l JOIN members m ON m.id = l.member_id
          WHERE 1=1 ${cohortClause}
          GROUP BY l.member_id, period_label HAVING SUM(l.hours) >= @threshold`).all(params) as any[];
      } else { // rolling_12m
        rows = db.prepare(`
          SELECT l.member_id, 'rolling-12m' period_label, ROUND(SUM(l.hours),2) hours
          FROM engagement_logs l JOIN members m ON m.id = l.member_id
          WHERE l.date >= date('now','-12 months') ${cohortClause}
          GROUP BY l.member_id HAVING SUM(l.hours) >= @threshold`).all(params) as any[];
      }

      for (const r of rows) {
        const res = ins.run(r.member_id, rule.id, r.period_label, r.hours);
        if (res.changes) flagged++;
        else upd.run(r.hours, r.member_id, rule.id, r.period_label);
      }
    }
  });
  tx();
  return { rules: rules.length, newFlags: flagged };
}

export function recognitionSummary() {
  const byRule = db.prepare(`
    SELECT r.id rule_id, r.name, r.name_ar, r.threshold_hours, r.period,
           COUNT(f.id) flagged,
           SUM(CASE WHEN f.status IN ('confirmed','recognised') THEN 1 ELSE 0 END) confirmed
    FROM recognition_rules r LEFT JOIN recognition_flags f ON f.rule_id = r.id
    WHERE r.active=1 GROUP BY r.id ORDER BY r.threshold_hours`).all();

  const distinct = db.prepare('SELECT COUNT(DISTINCT member_id) c FROM recognition_flags').get() as any;
  return { byRule, distinctMembersFlagged: distinct?.c ?? 0 };
}
