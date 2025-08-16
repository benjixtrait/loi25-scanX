// app/api/scan/status/route.ts
import { NextRequest, NextResponse } from 'next/server';

const BASE = 'https://api.didomi.io/v1';

async function getToken() {
  const res = await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'api-key',
      key: process.env.DIDOMI_API_KEY,
      secret: process.env.DIDOMI_API_SECRET,
    }),
  });
  if (!res.ok) throw new Error('Didomi auth failed');
  const data = await res.json();
  return data.access_token as string;
}
function api(token: string) {
  return (path: string, init?: RequestInit) =>
    fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
      },
    });
}

function isEssentialByHeuristic(t: any) {
  const allow = ['didomi_token', 'euconsent-v2'];
  const name = (t?.name || t?.initial_name || '').toLowerCase();
  return allow.includes(name);
}
function summarize(trackers: any[], privacy: any, score: number | null) {
  const arr = Array.isArray(trackers) ? trackers : [];
  const pre = arr.filter((t) => t?.cmp?.scenario_step?.id?.includes?.('no_user_choice'));
  const refuse = arr.filter((t) => t?.cmp?.scenario_step?.id?.includes?.('refuse_to_all'));
  const suspiciousPre = pre.filter((t) => !isEssentialByHeuristic(t));
  const suspiciousRefuse = refuse.filter((t) => !isEssentialByHeuristic(t));

  const priv = privacy?.privacy || {};
  const issues: string[] = [];
  if (suspiciousPre.length) issues.push(`Traceurs avant consentement: ${suspiciousPre.length}`);
  if (suspiciousRefuse.length) issues.push(`Traceurs malgré refus: ${suspiciousRefuse.length}`);
  if (priv.has_privacy_policy === false) issues.push('Politique de confidentialité non détectée');
  if (priv.has_user_consent_choice === false) issues.push('CMP non détectée');
  if (priv.has_short_cookies_lifetime === false) issues.push('Durée cookies > 13 mois');

  const pass = issues.length === 0 && typeof score === 'number' && score >= 90;
  const simplify = (xs: any[]) =>
    xs.slice(0, 50).map((t) => ({
      name: t.name || t.initial_name,
      host: t.host,
      vendor: t?.vendor?.name,
      type: t.type,
      page: t.page_url,
      third_party: t.is_third_party,
      persistent: t.is_persistent,
      scenario_steps: t?.cmp?.scenario_step?.id,
    }));

  return {
    summary: {
      pass,
      score,
      issues,
      privacy_flags: {
        has_cmp: !!priv.has_user_consent_choice,
        has_privacy_policy: !!priv.has_privacy_policy,
        cookies_lt_13_months: !!priv.has_short_cookies_lifetime,
      },
    },
    cookies_before_consent: simplify(suspiciousPre),
    cookies_after_refuse: simplify(suspiciousRefuse),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const token = await getToken();
    const call = api(token);
    const org = process.env.DIDOMI_ORG_ID!;
    const res = await call(`/reports/compliances/reports/${id}?organization_id=${encodeURIComponent(org)}&$with[]=outputs`);
    const data = await res.json();

    const summary = data?.data ?? data;
    const status = summary?.status as string | undefined;
    const score = (typeof summary?.score === 'number') ? summary.score : null;
    const errors = Array.isArray(summary?.errors) ? summary.errors : [];

    if (!status || !['success','partial','failed'].includes(status)) {
      return NextResponse.json({ status: status ?? 'pending', score, errors, outputs_present: false });
    }

    const outputs = summary?.outputs || {};
    const trackersUrl = outputs['report_aggregated_trackers.json']?.url;
    const privacyUrl  = outputs['report_privacy.json']?.url;

    const [trackers, privacy] = await Promise.all([
      trackersUrl ? fetch(trackersUrl).then(r => r.json()).catch(() => []) : [],
      privacyUrl ? fetch(privacyUrl).then(r => r.json()).catch(() => ({})) : {},
    ]);

    const result = summarize(trackers, privacy, score);
    return NextResponse.json({ status, score, errors, outputs_present: !!(trackersUrl || privacyUrl), result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}
