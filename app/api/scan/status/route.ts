import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';

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
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
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
  
      // 1) Toujours recharger le rapport AVEC outputs (liens frais)
      const res = await call(
        `/reports/compliances/reports/${id}?organization_id=${encodeURIComponent(org)}&$with[]=outputs`
      );
      const data = await res.json();
  
      // 2) Le résumé est dans data.data (selon la doc)
      const summary = data?.data ?? data;
      const status = summary?.status as string | undefined;
  
      // 3) Le score est au niveau du rapport (et 0 est un nombre valide)
      const score = (typeof summary?.score === 'number') ? summary.score : null;
  
      // 4) Surfaces les erreurs (anti-bot, no_button_found, etc.)
      const errors = Array.isArray(summary?.errors) ? summary.errors : [];
  
      // 5) Si pas terminé, retourne juste le statut + erreurs éventuelles
      if (!status || !['success', 'partial', 'failed'].includes(status)) {
        return NextResponse.json({ status: status ?? 'pending', score, errors, outputs_present: false });
      }
  
      // 6) Récupère outputs (liens éphémères, donc tout de suite)
      const outputs = summary?.outputs || {};
      const trackersUrl = outputs['report_aggregated_trackers.json']?.url;
      const privacyUrl  = outputs['report_privacy.json']?.url;
  
      let trackers: any[] = [];
      let privacy: any = {};
  
      try { if (trackersUrl) trackers = await fetch(trackersUrl).then(r => r.json()); } catch {}
      try { if (privacyUrl)  privacy  = await fetch(privacyUrl).then(r => r.json()); } catch {}
  
      // 7) Résumé conforme
      const result = summarize(trackers, privacy, score);
  
      return NextResponse.json({
        status,
        score,
        errors,               // <= maintenant visibles côté UI
        outputs_present: !!(trackersUrl || privacyUrl),
        result
      });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
    }
  }