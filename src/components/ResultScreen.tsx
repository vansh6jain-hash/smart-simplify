import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Brain, Baby, BookOpen, GraduationCap, RotateCcw, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const TOTAL_QUESTIONS = 5;

function getLevelLabel(level: number) {
  if (level <= 3) return "Child";
  if (level <= 6) return "Beginner";
  return "Expert";
}

function getLevelIcon(level: number) {
  if (level <= 3) return <Baby className="h-10 w-10" />;
  if (level <= 6) return <BookOpen className="h-10 w-10" />;
  return <GraduationCap className="h-10 w-10" />;
}

function getBarColor(level: number) {
  if (level <= 3) return "bg-emerald-500";
  if (level <= 6) return "bg-amber-500";
  return "bg-violet-500";
}

interface ResultScreenProps {
  concept: string;
  level: number;
  correctCount: number;
  levelHistory: number[];
  studyMaterial: string;
  onRestart: () => void;
}

const ResultScreen = ({ concept, level, correctCount, levelHistory, studyMaterial, onRestart }: ResultScreenProps) => {
  const label = getLevelLabel(level);
  const [explanation, setExplanation] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchExplanation = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("generate-explanation", {
        body: { concept, level, studyMaterial },
      });
      if (fnError) throw fnError;
      setExplanation(data.explanation);
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExplanation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concept, level]);

  const maxLevel = 10;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg space-y-8 text-center">
        {/* Level icon */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex flex-col items-center gap-4"
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 text-primary">
            {getLevelIcon(level)}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            You're at <span className="text-primary">{label}</span> level
          </h1>
        </motion.div>

        {/* Score pills */}
        <div className="flex items-center justify-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
            <Brain className="h-4 w-4" />
            Level {level}/10
          </span>
          <span className="inline-flex items-center rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground">
            Score: {correctCount}/{TOTAL_QUESTIONS}
          </span>
        </div>

        {/* Difficulty curve chart */}
        {levelHistory.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Difficulty curve
            </h3>
            <div className="flex items-end justify-center gap-1.5" style={{ height: 80 }}>
              {levelHistory.map((lvl, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  animate={{ height: `${(lvl / maxLevel) * 100}%` }}
                  transition={{ duration: 0.4, delay: i * 0.06, ease: "easeOut" }}
                  className={`w-6 rounded-t-md ${getBarColor(lvl)}`}
                  title={`Q${i + 1}: Level ${lvl}`}
                />
              ))}
            </div>
            <div className="mt-1.5 flex justify-center gap-1.5">
              {levelHistory.map((_, i) => (
                <span key={i} className="w-6 text-center text-[10px] text-muted-foreground">
                  {i + 1}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Explanation card */}
        <div className="rounded-2xl border border-border bg-card p-6 text-left shadow-sm">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {concept} — explained for {label.toLowerCase()} level
          </h3>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-6 gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Crafting your explanation…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              <p className="text-sm text-muted-foreground text-center">
                Couldn't generate the explanation. Please try again.
              </p>
              <Button variant="outline" size="sm" onClick={fetchExplanation} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            </div>
          ) : (
            <p className="text-base leading-relaxed text-card-foreground">
              {explanation}
            </p>
          )}
        </div>

        {/* Restart */}
        <Button
          variant="outline"
          onClick={onRestart}
          className="h-12 rounded-xl px-8 text-base font-semibold gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Try another concept
        </Button>
      </div>
    </div>
  );
};

export default ResultScreen;
