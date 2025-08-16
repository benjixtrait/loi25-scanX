// app/api/cron/poll/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
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

export async function GET() {
  const { rows: scans } = await sql`
    select sr.id, sr.website_url, sr.didomi_report_id, c.email, c.magic_token
    from scan_requests sr
    join scan_contacts c on c.scan_id = sr.id
    where sr.status not in ('success','partial','failed')
    limit 50
  `;
  if (!scans.length) return NextResponse.json({ ok: true, processed: 0 });

  const token = await getToken();
  const call = api(token);
  const org = process.env.DIDOMI_ORG_ID!;

  let processed = 0;
  for (const s of scans) {
    const res = await call(`/reports/compliances/reports/${s.didomi_report_id}?organization_id=${encodeURIComponent(org)}`);
    const data = await res.json();
    const summary = data?.data ?? data;
    const status = summary?.status as string | undefined;
    const score = typeof summary?.score === 'number' ? summary.score : null;

    if (status && ['success', 'partial', 'failed'].includes(status)) {
      await sql`update scan_requests set status=${status}, score=${score}, updated_at=now() where id=${s.id}`;
      const link = `${process.env.APP_BASE_URL}/report/${s.magic_token}`;

      await resend.emails.send({
        from: 'X-Trait <rapport@x-trait.com>',
        to: s.email,
        subject: `Votre rapport est prêt (${new URL(s.website_url).hostname})`,
        html: `
          <p>Bonjour,</p>
          <p>Votre rapport de conformité est prêt pour <b>${s.website_url}</b>.</p>
          <p>Score Didomi : <b>${score ?? 'n/a'}/100</b></p>
          <p><a href="${link}">Consulter le rapport</a></p>
          <p>— L’équipe X-Trait</p>
        `,
      });

      processed++;
    }
  }

  return NextResponse.json({ ok: true, processed });
}
