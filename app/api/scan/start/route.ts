// app/api/scan/start/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { randomBytes } from 'crypto';

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

export async function POST(req: NextRequest) {
  try {
    const { url, email, firstName, lastName, notify = true, marketing = false } = await req.json();
    if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 });
    if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });

    const token = await getToken();
    const call = api(token);
    const org = process.env.DIDOMI_ORG_ID!;

    // upsert property
    const listRes = await call(`/reports/compliances/properties?organization_id=${encodeURIComponent(org)}&website=${encodeURIComponent(url)}`);
    const list = await listRes.json();
    let propertyId = list?.data?.[0]?.id;

    if (!propertyId) {
      const body = {
        website: url,
        name: `Scan ${url}`,
        pages_count: 5,
        country: 'ca',
        enabled: true,
        scenarios: [
          { enabled: true, type: 'accept_all', scenario_actions: [{ type: 'accept', order: 0 }] },
          { enabled: true, type: 'refuse_all', scenario_actions: [{ type: 'refuse', order: 0 }] },
          { enabled: true, type: 'no_actions', scenario_actions: [] },
        ],
      };
      const createRes = await call(`/reports/compliances/properties?organization_id=${encodeURIComponent(org)}`, {
        method: 'POST', body: JSON.stringify(body),
      });
      const created = await createRes.json();
      propertyId = created?.data?.id ?? created?.id;
    }

    // trigger report
    const repRes = await call(`/reports/compliances/reports?organization_id=${encodeURIComponent(org)}`, {
      method: 'POST', body: JSON.stringify({ property_id: propertyId }),
    });
    const rep = await repRes.json();
    const reportId = rep?.data?.id ?? rep?.id;

    // DB save
    const magicToken = randomBytes(24).toString('hex');
    const { rows: sr } = await sql`
      insert into scan_requests (website_url, didomi_report_id, status)
      values (${url}, ${reportId}, 'queued')
      returning id
    `;
    const scanId = sr[0].id as string;

    await sql`
      insert into scan_contacts (scan_id, email, first_name, last_name, notify_ready, marketing_opt_in, magic_token)
      values (${scanId}, ${email}, ${firstName || null}, ${lastName || null}, ${notify}, ${marketing}, ${magicToken})
    `;

    return NextResponse.json({ reportId, scanId, magicToken });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}
