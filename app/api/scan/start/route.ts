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

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 });

    const token = await getToken();
    const call = api(token);
    const org = process.env.DIDOMI_ORG_ID!;

    // 1) Upsert property pour l’URL
    const listRes = await call(
      `/reports/compliances/properties?organization_id=${encodeURIComponent(org)}&website=${encodeURIComponent(url)}`
    );
    const list = await listRes.json();
    let propertyId = list?.data?.[0]?.id;

    if (!propertyId) {
      const body = {
        website: url,
        name: `Scan ${url}`,
        pages_count: 1,
        country: 'ca',
        enabled: true,
        scenarios: [
          { enabled: true, type: 'accept_all', scenario_actions: [{ type: 'accept', order: 0 }] },
        ],
      };
      const createRes = await call(
        `/reports/compliances/properties?organization_id=${encodeURIComponent(org)}`,
        { method: 'POST', body: JSON.stringify(body) }
      );
      const created = await createRes.json();
      propertyId = created?.data?.id ?? created?.id;
    }

    // 2) Lancer le rapport
    const repRes = await call(
      `/reports/compliances/reports?organization_id=${encodeURIComponent(org)}`,
      { method: 'POST', body: JSON.stringify({ property_id: propertyId }) }
    );
    const rep = await repRes.json();
    const reportId = rep?.data?.id ?? rep?.id;

    return NextResponse.json({ reportId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}
