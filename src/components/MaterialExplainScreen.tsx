import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { explainMaterial } from "@/lib/api";
import { waitIfNeeded } from "@/lib/apiTimer";
import ExplanationRenderer, { ExplanationData } from "@/components/ExplanationRenderer";

interface MaterialExplainScreenProps {
  studyMaterial: string;
  concept: string;
  onRestart: () => void;
}

const MaterialExplainScreen = ({
  studyMaterial,
  concept,
  onRestart,
}: MaterialExplainScreenProps) => {
  const [data, setData] = useState<ExplanationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState(
    "Could not analyze material. Please try again."
  );
  const [countdown, setCountdown] = useState(0);

  const fetchExplanation = async () => {
    setLoading(true);
    setError(false);
    try {
      // Wait if needed before API call
      await waitIfNeeded(setCountdown);

      const result = await explainMaterial(studyMaterial, concept);

      // BUG 4 — check for material_unreadable signal from Gemini
      if (result?.error === "material_unreadable") {
        setErrorMessage(
          "Your file could not be analyzed. Please try uploading a PNG or JPG image of your notes instead."
        );
        setError(true);
      } else {
        setData(result as ExplanationData);
      }
    } catch (e) {
      console.error(e);
      setErrorMessage("Could not analyze material. Please try again.");
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExplanation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSuggestedQuestion = (q: string) => {
    sessionStorage.setItem("knowfirst_prefill_concept", q);
    onRestart();
  };

  // Countdown UI component
  const CountdownOverlay = () =>
    countdown > 0 ? (
      <div className="text-center py-4">
        <div className="text-sm text-muted-foreground">Almost ready... {countdown}s</div>
        <div className="h-1 bg-muted rounded-full mt-2 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-1000 ease-linear"
            style={{ width: `${(countdown / 13) * 100}%` }}
          />
        </div>
      </div>
    ) : null;

  return (
    <div className="flex min-h-screen flex-col px-4 py-8">
      <div className="w-full max-w-2xl mx-auto space-y-6">
        {/* Back button */}
        <button
          onClick={onRestart}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Start over
        </button>

        {loading ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 gap-4"
          >
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-base text-muted-foreground">
              Analyzing your material...
            </p>
            <CountdownOverlay />
          </motion.div>
        ) : error ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 gap-4"
          >
            <div className="rounded-2xl border border-border bg-card p-8 text-center max-w-sm space-y-4">
              <p className="text-base text-muted-foreground">{errorMessage}</p>
              <div className="flex flex-col gap-2">
                <Button variant="outline" onClick={fetchExplanation} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Retry
                </Button>
                <Button variant="ghost" onClick={onRestart} className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Start over
                </Button>
              </div>
            </div>
          </motion.div>
        ) : data ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="space-y-6"
          >
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <ExplanationRenderer
                data={data}
                onSuggestedQuestion={handleSuggestedQuestion}
              />
            </div>

            <Button
              variant="outline"
              onClick={onRestart}
              className="h-12 rounded-xl px-8 text-base font-semibold gap-2 w-full"
            >
              <ArrowLeft className="h-4 w-4" />
              Start over
            </Button>
          </motion.div>
        ) : null}
      </div>
    </div>
  );
};

export default MaterialExplainScreen;
