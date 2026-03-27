import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const optionLetters = ["A", "B", "C", "D"];

function getLevelLabel(level: number) {
  if (level <= 3) return "Child";
  if (level <= 6) return "Beginner";
  return "Expert";
}

function getLevelBadgeColor(level: number) {
  if (level <= 3) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (level <= 6) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-violet-100 text-violet-700 border-violet-200";
}

function getBarColor(level: number) {
  if (level <= 3) return "bg-emerald-500";
  if (level <= 6) return "bg-amber-500";
  return "bg-violet-500";
}

interface Question {
  question: string;
  options: string[];
  correct: string;
  explanation: string;
}

interface QuizScreenProps {
  concept: string;
  onFinish: (level: number, correct: number, levelHistory: number[]) => void;
}

const QuizScreen = ({ concept, onFinish }: QuizScreenProps) => {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [level, setLevel] = useState(5);
  const [correctCount, setCorrectCount] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [questionHistory, setQuestionHistory] = useState<string[]>([]);
  const [levelHistory, setLevelHistory] = useState<number[]>([]);
  const [question, setQuestion] = useState<Question | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const lastFetchRef = useRef<{ lvl: number; history: string[] }>({ lvl: 5, history: [] });

  const fetchQuestion = async (lvl: number, history: string[]) => {
    setLoading(true);
    setError(false);
    lastFetchRef.current = { lvl, history };

    try {
      const { data, error: fnError } = await supabase.functions.invoke("generate-question", {
        body: { concept, level: lvl, questionHistory: history },
      });

      if (fnError) {
        const message = (fnError as { message?: string }).message ?? "Failed to generate question";
        throw new Error(message);
      }

      setQuestion(data as Question);
      setQuestionHistory((prev) => [...prev, (data as Question).question]);
    } catch (e) {
      console.error(e);
      setQuestion(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    fetchQuestion(lastFetchRef.current.lvl, lastFetchRef.current.history);
  };

  useEffect(() => {
    fetchQuestion(level, questionHistory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = (letter: string) => {
    if (answered || !question) return;
    setSelectedAnswer(letter);
    setAnswered(true);

    let newLevel = level;
    if (letter === question.correct) {
      setCorrectCount((c) => c + 1);
      newLevel = Math.min(10, level + 1);
    } else {
      newLevel = Math.max(1, level - 1);
    }
    setLevel(newLevel);
    setLevelHistory((prev) => [...prev, newLevel]);
  };

  const handleNext = () => {
    if (currentQuestion >= 9) {
      onFinish(level, correctCount, levelHistory);
      return;
    }
    setCurrentQuestion((q) => q + 1);
    setSelectedAnswer(null);
    setAnswered(false);
    setQuestion(null);
    fetchQuestion(level, questionHistory);
  };

  const isCorrect = question && selectedAnswer === question.correct;
  const progressPercent = (level / 10) * 100;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg space-y-6">
        {/* Concept chip */}
        <div className="flex items-center justify-center">
          <span className="rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary">
            {concept}
          </span>
        </div>

        {/* Progress bar + level badge */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              Level {level}/10
            </span>
            <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold transition-colors duration-300 ${getLevelBadgeColor(level)}`}>
              {getLevelLabel(level)}
            </span>
          </div>
          {/* Animated colored progress bar */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              className={`h-full rounded-full ${getBarColor(level)}`}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
            />
          </div>
        </div>

        {/* Question counter */}
        <p className="text-center text-sm font-medium text-muted-foreground">
          Question {currentQuestion + 1} of 10
        </p>

        {/* Question card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuestion}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
            className="rounded-2xl border border-border bg-card p-6 shadow-sm"
          >
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Generating question…</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <p className="text-sm text-muted-foreground text-center">
                  Oops! Couldn't generate a question. Check your connection and try again.
                </p>
                <Button variant="outline" onClick={handleRetry} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Retry
                </Button>
              </div>
            ) : question ? (
              <>
                <h2 className="mb-6 text-xl font-semibold text-card-foreground">
                  {question.question}
                </h2>

                <div className="space-y-3">
                  {question.options.map((option, i) => {
                    const letter = optionLetters[i];
                    let optionClass =
                      "w-full rounded-xl border-2 px-4 py-3.5 text-left text-sm font-medium transition-all duration-200 ";

                    if (!answered) {
                      optionClass +=
                        "border-border bg-card text-foreground hover:border-primary/50 hover:bg-secondary";
                    } else if (letter === question.correct) {
                      // Always highlight correct answer green
                      optionClass += "border-success bg-success/10 text-success";
                    } else if (letter === selectedAnswer) {
                      optionClass += "border-destructive bg-destructive/10 text-destructive";
                    } else {
                      optionClass += "border-border bg-card text-muted-foreground opacity-50";
                    }

                    return (
                      <button
                        key={letter}
                        onClick={() => handleSelect(letter)}
                        disabled={answered}
                        className={optionClass}
                      >
                        <span className="flex items-center gap-2">
                          {option}
                          {answered && letter === question.correct && (
                            <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-success" />
                          )}
                          {answered && letter === selectedAnswer && letter !== question.correct && (
                            <XCircle className="ml-auto h-4 w-4 shrink-0 text-destructive" />
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Feedback */}
                {answered && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mt-5 flex items-start gap-3 rounded-xl p-4 ${isCorrect ? "bg-success/10" : "bg-destructive/10"}`}
                  >
                    {isCorrect ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                    ) : (
                      <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                    )}
                    <div>
                      <p className={`text-sm font-semibold ${isCorrect ? "text-success" : "text-destructive"}`}>
                        {isCorrect ? "Correct!" : "Incorrect"}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {question.explanation}
                      </p>
                    </div>
                  </motion.div>
                )}
              </>
            ) : null}
          </motion.div>
        </AnimatePresence>

        {/* Next button */}
        {answered && !loading && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Button onClick={handleNext} className="w-full h-12 rounded-xl text-base font-semibold gap-2">
              {currentQuestion >= 9 ? "See Results" : "Next"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default QuizScreen;
