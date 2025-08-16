'use client';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function scoreToStars(score: number | null) {
  if (score == null) return 0;
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 61) return 3;
  if (score >= 40) return 2;
  if (score >= 30) return 1;
  return 0;
}
function verdictLabelFromStars(stars: number) {
  return stars >= 5 ? 'Excellent (5★)'
    : stars >= 4 ? 'Très bon (4★)'
    : stars >= 3 ? 'Correct (3★)'
    : stars >= 2 ? 'Insuffisant (2★)'
    : stars >= 1 ? 'Faible (1★)'
    : 'Critique (0★)';
}
function verdictCopyFromStars(stars: number) {
  switch (true) {
    case stars >= 5: return 'Excellent niveau de conformité. Continuez la surveillance et les revues régulières de votre CMP.';
    case stars >= 4: return 'Très bon résultat. Quelques ajustements mineurs possibles.';
    case stars >= 3: return "Conformité correcte. Améliorez le bandeau et les paramètres de consentement.";
    case stars >= 2: return 'Conformité insuffisante. Des points critiques sont probables.';
    case stars >= 1: return "Conformité faible. Audit complet recommandé.";
    default: return 'Conformité critique. Mettez en place une CMP conforme et bloquez les traceurs non essentiels.';
  }
}
function Star({ filled, delay }: { filled: boolean; delay: number }) {
  return (
    <motion.span
      initial={{ x: 60, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 18, delay }}
      aria-hidden="true"
      className="inline-block text-2xl"
    >
      {filled ? '★' : '☆'}
    </motion.span>
  );
}

export default function Page() {
  const [url, setUrl] = useState('');
  const [reportId, setReportId] = useState<string | null>(null);

  const [status, setStatus] = useState<string>('');
  const [score, setScore] = useState<number | null>(null);
  const [errors, setErrors] = useState<any[]>([]);
  const [outputsPresent, setOutputsPresent] = useState<boolean | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>('');

  // contact pendant l’attente (optionnel)
  const [email, setEmail] = useState('');
  const [firstName, setFirst] = useState('');
  const [lastName, setLast] = useState('');
  const [marketingOptIn, setMarketing] = useState(false);

  const isScanning = !!reportId && ['starting', 'queued', 'running', 'pending'].includes(status);
  const isFinished = !!reportId && ['success', 'partial', 'failed'].includes(status);
  const [showVerdictModal, setShowVerdictModal] = useState(false);

  const [introStep, setIntroStep] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    const t1 = setTimeout(() => setIntroStep(1), 450);
    const t2 = setTimeout(() => setIntroStep(2), 900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  async function startScan(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setStatus('starting');
    setScore(null);
    setErrors([]);
    setOutputsPresent(null);
    setResult(null);
    setShowVerdictModal(false);

    try {
      const res = await fetch('/api/scan/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url,
          email,
          firstName,
          lastName,
          notify: true,
          marketing: marketingOptIn
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Erreur lors du démarrage du scan');
        setStatus('');
        return;
      }
      setReportId(data.reportId);
      setStatus('queued');
    } catch (e: any) {
      setError(e?.message || 'Erreur réseau');
      setStatus('');
    }
  }

  useEffect(() => {
    if (!reportId) return;
    const it = setInterval(async () => {
      try {
        const res = await fetch(`/api/scan/status?id=${encodeURIComponent(reportId)}`);
        const data = await res.json();

        if (data?.error) { setError(data.error); clearInterval(it); return; }
        if (data?.status) setStatus(data.status);
        if ('score' in data) setScore(typeof data.score === 'number' ? data.score : null);
        if (Array.isArray(data?.errors)) setErrors(data.errors);
        if ('outputs_present' in data) setOutputsPresent(!!data.outputs_present);

        if (['success','partial','failed'].includes(data?.status)) {
          if (data?.result) setResult(data.result);
          clearInterval(it);
          setShowVerdictModal(true);
        }
      } catch (e: any) {
        setError(e?.message || 'Erreur réseau');
        clearInterval(it);
      }
    }, 3000);
    return () => clearInterval(it);
  }, [reportId]);

  const stars = useMemo(() => scoreToStars(score), [score]);

  return (
    <div className="min-h-svh bg-white">
      <div className="container mx-auto px-6 py-12">
        {/* Logo */}
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 18 }}
          className="mt-10 flex justify-center"
        >
          <img
            src="https://x-trait.com/wp-content/uploads/2023/08/LOGO_X-Trait.png"
            alt="X-Trait"
            className="h-auto w-[220px]"
          />
        </motion.div>

        {/* Texte explicatif */}
        <AnimatePresence>
          {introStep >= 1 && (
            <motion.p
              key="intro-text"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: 0.15 }}
              className="mt-4 text-center text-lg leading-relaxed text-slate-700"
            >
              Analyse automatique de conformité <b>RGPD</b> & <b>Loi 25</b> : détectez les traceurs déposés avant consentement,
              vérifiez la présence de votre CMP et obtenez un score global Didomi.
            </motion.p>
          )}
        </AnimatePresence>

        {/* Formulaire URL + bouton */}
        <AnimatePresence>
          {introStep >= 2 && (
            <motion.form
              key="form"
              onSubmit={startScan}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: 0.2 }}
              className="mx-auto mt-5 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2"
            >
              <Input
                placeholder="https://www.exemple.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                inputMode="url"
                className="h-11 sm:col-span-2"
              />
              <Input placeholder="Prénom" value={firstName} onChange={e=>setFirst(e.target.value)} />
              <Input placeholder="Nom" value={lastName} onChange={e=>setLast(e.target.value)} />
              <Input placeholder="Email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="sm:col-span-2" />
              <label className="sm:col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" className="accent-black" checked={marketingOptIn} onChange={e=>setMarketing(e.target.checked)} />
                J’accepte de recevoir des communications (optionnel).
              </label>
              <div className="sm:col-span-2 flex justify-end">
                <Button type="submit" className="h-11 px-5">Scanner mon site</Button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Infos de statut */}
        <div className="mx-auto mt-3 max-w-3xl">
          {status && (
            <p className="mt-1 text-slate-500">
              <b>Statut :</b> {status}
              {typeof score === 'number' && <span className="ml-3"><b>Score Didomi :</b> {score}</span>}
            </p>
          )}
          {error && <p className="mt-1 text-red-600">{error}</p>}
          {Array.isArray(errors) && errors.length > 0 && (
            <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="m-0 font-semibold">Erreurs Didomi :</p>
              <ul className="ml-4 mt-1 list-disc">
                {errors.map((e, i) => <li key={i}>{(e?.error_type || 'erreur')} — {e?.error_description || ''}</li>)}
              </ul>
            </div>
          )}
          {outputsPresent === false && isFinished && (
            <p className="mt-1 text-amber-700">Sorties (trackers/privacy) non disponibles (liens expirés). Le score reste fiable.</p>
          )}
        </div>
      </div>

      {/* Overlay attente */}
      <AnimatePresence>
        {isScanning && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.98, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 22 }}
              className="w-[min(86vw,820px)] rounded-2xl bg-white p-6 shadow-2xl"
            >
              <div className="flex flex-col gap-4 md:flex-row">
                <div className="basis-1/2">
                  <div className="flex items-center gap-3">
                    <div aria-label="Chargement" className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
                    <div>
                      <p className="m-0 font-bold">Nous analysons votre site internet…</p>
                      <p className="m-0 text-slate-500">Cela peut prendre un peu de temps.</p>
                    </div>
                  </div>
                  {process.env.NEXT_PUBLIC_WEBINAR_URL && (
                    <div className="mt-4 aspect-video w-full overflow-hidden rounded-lg border">
                      <iframe
                        src={process.env.NEXT_PUBLIC_WEBINAR_URL}
                        className="h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title="Webinaire"
                      />
                    </div>
                  )}
                </div>

                <div className="basis-1/2">
                  <p className="mb-2 text-sm text-slate-600">Laissez-nous vos coordonnées — on vous envoie le lien du rapport dès qu’il est prêt.</p>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <Input placeholder="Prénom" value={firstName} onChange={e=>setFirst(e.target.value)} />
                    <Input placeholder="Nom" value={lastName} onChange={e=>setLast(e.target.value)} />
                    <Input className="md:col-span-2" placeholder="Email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} />
                    <label className="md:col-span-2 flex items-center gap-2 text-sm">
                      <input type="checkbox" className="accent-black" checked={marketingOptIn} onChange={e=>setMarketing(e.target.checked)} />
                      J’accepte de recevoir des communications (optionnel).
                    </label>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de verdict */}
      <Dialog open={isFinished && showVerdictModal} onOpenChange={setShowVerdictModal}>
        <DialogContent className="sm:max-w-[680px]">
          <DialogHeader>
            <DialogTitle>Verdict de conformité</DialogTitle>
            <DialogDescription>Résultat de l’analyse Didomi pour votre site.</DialogDescription>
          </DialogHeader>

          <div className="mt-2 flex justify-center gap-2">
            {[0,1,2,3,4].map((i) => {
              const delay = 0.1 * (4 - i);
              const filled = i < stars;
              return <Star key={i} filled={filled} delay={delay} />;
            })}
          </div>

          <p className="mt-2 text-center font-semibold">
            {verdictLabelFromStars(stars)}{typeof score === 'number' ? ` — Score ${score}/100` : ''}
          </p>
          <p className="mt-1 text-center text-slate-600">{verdictCopyFromStars(stars)}</p>

          <DialogFooter className="sm:justify-center">
            <Button asChild>
              <a href="https://x-trait.com/contact/" target="_blank" rel="noreferrer">
                Prenez contact avec nos experts pour vous améliorer
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
