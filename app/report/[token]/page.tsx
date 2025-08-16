import { sql } from '@vercel/postgres';
import ResultClient from './result-client';

export default async function ReportPage({ params }: { params: { token: string } }) {
  const { rows } = await sql`
    select sr.didomi_report_id, sr.status, sr.score, sr.website_url
    from scan_contacts c
    join scan_requests sr on sr.id = c.scan_id
    where c.magic_token = ${params.token}
    limit 1
  `;
  if (!rows.length) return <div className="p-6">Lien invalide ou expiré.</div>;
  return <ResultClient initial={rows[0]} />;
}
