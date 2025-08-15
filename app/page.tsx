'use client';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// --- Helpers: score -> stars & verdict text ---
function scoreToStars(score: number | null) {
  if (score == null) return 0;
  if (score >= 90) return 5;   // 5 étoiles
  if (score >= 75) return 4;   // 4 étoiles
  if (score >= 61) return 3;   // 3 étoiles
  if (score >= 40) return 2;   // 2 étoiles
  if (score >= 30) return 1;   // 1 étoile
  return 0;                    // 0 étoile
}

function verdictLabelFromStars(stars: number) {
  return (
    stars >= 5 ? 'Excellent (5★)'
  : stars >= 4 ? 'Très bon (4★)'
  : stars >= 3 ? 'Correct (3★)'
  : stars >= 2 ? 'Insuffisant (2★)'
  : stars >= 1 ? 'Faible (1★)'
  : 'Critique (0★)'
  );
}

function verdictCopyFromStars(stars: number) {
  switch (true) {
    case stars >= 5:
      return 'Excellent niveau de conformité. Continuez la surveillance, la documentation et les revues régulières de votre CMP.';
    case stars >= 4:
      return 'Très bon résultat. Quelques ajustements mineurs possibles (durée des cookies, mentions, granularité du refus).';
    case stars >= 3:
      return "Conformité correcte. Priorisez l'amélioration du bandeau, des paramètres de consentement et des liens légaux.";
    case stars >= 2:
      return 'Conformité insuffisante. Des points critiques sont probables (dépôt avant consentement, refus non respecté).';
    case stars >= 1:
      return "Conformité faible. Un audit complet et une refonte du parcours de consentement sont recommandés.";
    default:
      return 'Conformité critique. Agissez rapidement pour corriger les non-conformités majeures (bandeau, dépôts sans consentement, mentions).';
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
  // --- Form & API state ---
  const [url, setUrl] = useState('');
  const [reportId, setReportId] = useState<string | null>(null);

  const [status, setStatus] = useState<string>('');           // starting | queued | running | pending | success | partial | failed
  const [score, setScore] = useState<number | null>(null);    // 0..100 ou null
  const [errors, setErrors] = useState<any[]>([]);
  const [outputsPresent, setOutputsPresent] = useState<boolean | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>('');

  // --- UI state ---
  const isScanning =
    !!reportId && ['starting', 'queued', 'running', 'pending'].includes(status);

  const isFinished =
    !!reportId && ['success', 'partial', 'failed'].includes(status);

  const [showVerdictModal, setShowVerdictModal] = useState(false);

  // Intro timing for staged appearance
  const [introStep, setIntroStep] = useState<0 | 1 | 2>(0); // 0: logo, 1: texte, 2: formulaire
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
        body: JSON.stringify({ url }),
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

  // Polling du statut Didomi
  useEffect(() => {
    if (!reportId) return;
    const it = setInterval(async () => {
      try {
        const res = await fetch(`/api/scan/status?id=${encodeURIComponent(reportId)}`);
        const data = await res.json();
        if (data?.error) {
          setError(data.error);
          clearInterval(it);
          return;
        }
        if (data?.status) setStatus(data.status);
        if ('score' in data) setScore(typeof data.score === 'number' ? data.score : null);
        if (Array.isArray(data?.errors)) setErrors(data.errors);
        if ('outputs_present' in data) setOutputsPresent(!!data.outputs_present);

        if (['success', 'partial', 'failed'].includes(data?.status)) {
          if (data?.result) setResult(data.result);
          clearInterval(it);
          // Affiche le modal de verdict dès que prêt
          setShowVerdictModal(true);
        }
      } catch (e: any) {
        setError(e?.message || 'Erreur réseau');
        clearInterval(it);
      }
    }, 2000);
    return () => clearInterval(it);
  }, [reportId]);

  const stars = useMemo(() => scoreToStars(score), [score]);

  return (
    <div className="min-h-screen bg-white">
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

        {/* Formulaire URL */}
        <AnimatePresence>
          {introStep >= 2 && (
            <motion.form
              key="form"
              onSubmit={startScan}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: 0.2 }}
              className="mx-auto mt-5 flex max-w-3xl gap-2"
            >
              <Input
                placeholder="https://www.exemple.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                inputMode="url"
                className="h-11"
              />
              <Button type="submit" className="h-11 px-5">
                Scanner mon site
              </Button>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Infos de statut & erreurs brèves sous le formulaire */}
        <div className="mx-auto mt-3 max-w-3xl">
          {status && (
            <p className="mt-1 text-slate-500">
              <b>Statut :</b> {status}
              {typeof score === 'number' && (
                <span className="ml-3">
                  <b>Score Didomi :</b> {score}
                </span>
              )}
            </p>
          )}
          {error && <p className="mt-1 text-red-600">{error}</p>}
          {Array.isArray(errors) && errors.length > 0 && (
            <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="m-0 font-semibold">Erreurs Didomi :</p>
              <ul className="ml-4 mt-1 list-disc">
                {errors.map((e, i) => (
                  <li key={i}>
                    {(e?.error_type || 'erreur')} — {e?.error_description || ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {outputsPresent === false && isFinished && (
            <p className="mt-1 text-amber-700">
              Sorties (trackers/privacy) non disponibles actuellement (liens expirés). Le score reste fiable.
            </p>
          )}
        </div>
      </div>

      {/* Overlay de scan (sombre + spinner + message) */}
      <AnimatePresence>
        {isScanning && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 22 }}
              className="w-[min(86vw,520px)] rounded-2xl bg-white p-6 shadow-2xl"
            >
              <div className="flex items-center gap-3">
                <div
                  aria-label="Chargement"
                  className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900"
                />
                <div>
                  <p className="m-0 font-bold">Nous analysons votre site internet…</p>
                  <p className="m-0 text-slate-500">Cela peut prendre un peu de temps.</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de verdict (shadcn Dialog) */}
      <Dialog open={showVerdictModal && isFinished} onOpenChange={setShowVerdictModal}>
        <DialogContent className="sm:max-w-[680px]">
          <DialogHeader>
            <DialogTitle>Verdict de conformité</DialogTitle>
            <DialogDescription>
              Résultat de l'analyse Didomi pour votre site.
            </DialogDescription>
          </DialogHeader>

          {/* Étoiles animées de droite à gauche */}
          <div className="mt-2 flex justify-center gap-2">
            {[0, 1, 2, 3, 4].map((i) => {
              const reverseIndex = 4 - i; // 4..0
              const filled = i < stars;
              const delay = 0.1 * reverseIndex;
              return <Star key={i} filled={filled} delay={delay} />;
            })}
          </div>

          <p className="mt-2 text-center font-semibold">
            {verdictLabelFromStars(stars)}{typeof score === 'number' ? ` — Score ${score}/100` : ''}
          </p>

          <p className="mt-1 text-center text-slate-600">
            {verdictCopyFromStars(stars)}
          </p>

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
