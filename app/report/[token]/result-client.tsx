// app/report/[token]/result-client.tsx
'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

function stars(score: number | null) {
  if (score == null) return 0;
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 61) return 3;
  if (score >= 40) return 2;
  if (score >= 30) return 1;
  return 0;
}

export default function ResultClient({ initial }: { initial: any }) {
  const [data, setData] = useState<any>(initial);

  useEffect(() => {
    // rafraîchir depuis Didomi si besoin
    fetch(`/api/scan/status?id=${encodeURIComponent(initial.didomi_report_id)}`)
      .then(r => r.json())
      .then((d) => setData((prev: any) => ({ ...prev, status: d.status, score: d.score, result: d.result })))
      .catch(() => {});
  }, [initial.didomi_report_id]);

  const s = typeof data.score === 'number' ? data.score : null;
  const st = stars(s);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Rapport — {new URL(data.website_url).hostname}</h1>
      <p className="mt-1 text-slate-600">Statut : {data.status}</p>

      <div className="mt-4 rounded-lg border p-4">
        <div className="mb-2 text-3xl">
          {Array.from({ length: 5 }, (_, i) => (
            <motion.span key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}>
              {i < st ? '★' : '☆'}
            </motion.span>
          ))}
        </div>
        <p>Score Didomi : <b>{s ?? 'n/a'}/100</b></p>
        {data.result?.summary && (
          <div className="mt-3 text-sm">
            <p className="font-medium">Drapeaux :</p>
            <ul className="ml-5 list-disc">
              <li>CMP détectée : {data.result.summary.privacy_flags?.has_cmp ? 'Oui' : 'Non'}</li>
              <li>Politique de confidentialité : {data.result.summary.privacy_flags?.has_privacy_policy ? 'Oui' : 'Non'}</li>
              <li>Cookies &lt; 13 mois : {data.result.summary.privacy_flags?.cookies_lt_13_months ? 'Oui' : 'Non'}</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
