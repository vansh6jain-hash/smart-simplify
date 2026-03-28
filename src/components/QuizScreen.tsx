import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, ArrowRight, Loader2, FileText } from "lucide-react";
import { generateQuestionBank, generateExplanation } from "@/lib/api";
import { waitIfNeeded } from "@/lib/apiTimer";
import ExplanationRenderer, { ExplanationData } from "@/components/ExplanationRenderer";

const TOTAL_QUESTIONS = 5;
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

type QuestionBank = {
  child: Question[];
  beginner: Question[];
  expert: Question[];
};

type UsedIndices = {
  child: number[];
  beginner: number[];
  expert: number[];
};

type PoolName = "child" | "beginner" | "expert";

interface QuizScreenProps {
  concept: string;
  studyMaterial: string;
  onFinish: (level: number, correct: number, levelHistory: number[]) => void;
}

const getPool = (l: number): PoolName => {
  if (l <= 3) return "child";
  if (l <= 6) return "beginner";
  return "expert";
};

const pickNextQuestion = (
  bank: QuestionBank | null,
  used: UsedIndices,
  currentLevel: number
): { question: Question; pool: PoolName; idx: number } | null => {
  if (!bank) return null;
  const pools: PoolName[] = ["child", "beginner", "expert"];
  const preferredPool = getPool(currentLevel);
  const searchOrder = [preferredPool, ...pools.filter((p) => p !== preferredPool)];
  for (const pool of searchOrder) {
    const available = bank[pool].map((_, i) => i).filter((i) => !used[pool].includes(i));
    if (available.length > 0) {
      const idx = available[0];
      return { question: bank[pool][idx], pool, idx };
    }
  }
  return null;
};

const QuizScreen = ({ concept, studyMaterial, onFinish }: QuizScreenProps) => {
  // Quiz state
  const [questionBank, setQuestionBank] = useState<QuestionBank | null>(null);
  const [usedIndices, setUsedIndices] = useState<UsedIndices>({
    child: [],
    beginner: [],
    expert: [],
  });
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [level, setLevel] = useState(5);
  const [questionCount, setQuestionCount] = useState(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [levelHistory, setLevelHistory] = useState<number[]>([]);

  // UI state
  const [screen, setScreen] = useState<"loading" | "quiz" | "loading-explanation" | "result">("loading");
  const [loadingMessage, setLoadingMessage] = useState("Building your personalized quiz...");
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState("");
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [answered, setAnswered] = useState(false);

  // Result state
  const [explanationData, setExplanationData] = useState<ExplanationData | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  // Initialize quiz on mount
  useEffect(() => {
    handleStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = async () => {
    setScreen("loading");
    setLoadingMessage("Building your personalized quiz...");
    setError("");

    await waitIfNeeded(setCountdown);

    try {
      const response = await generateQuestionBank(concept, studyMaterial, 5);
      const bank = response.questionBank;

      if (!bank) {
        throw new Error('No questionBank in response: ' + JSON.stringify(response).slice(0, 200));
      }

      setQuestionBank(bank);

      const initialUsed: UsedIndices = { child: [], beginner: [], expert: [] };
      const first = pickNextQuestion(bank, initialUsed, 5);

      if (!first) {
        throw new Error('Could not pick first question from bank');
      }

      setUsedIndices((prev) => ({
        ...prev,
        [first.pool]: [first.idx],
      }));
      setCurrentQuestion(first.question);
      setQuestionCount(1);
      setLevel(5);
      setLevelHistory([5]);
      setAnswers([]);
      setScreen("quiz");
    } catch (error: any) {
      console.error('handleStart failed:', error);
      setError(`Error: ${error?.message || error?.toString() || 'Unknown error'}`);
    }
  };

  const handleAnswer = (selectedKey: string) => {
    if (!currentQuestion || answered) return;
    const isCorrect = selectedKey === currentQuestion.correct;

    const newLevel = isCorrect ? Math.min(10, level + 1) : Math.max(1, level - 1);

    setLevel(newLevel);
    setLevelHistory((prev) => [...prev, newLevel]);
    setAnswers((prev) => [...prev, isCorrect]);
    if (isCorrect) setCorrectCount((c) => c + 1);

    setAnswered(true);
    setSelectedAnswer(selectedKey);
  };

  const handleNext = async () => {
    if (questionCount >= TOTAL_QUESTIONS) {
      await handleFinish();
      return;
    }

    const next = pickNextQuestion(questionBank, usedIndices, level);
    if (!next) {
      await handleFinish();
      return;
    }

    setUsedIndices((prev) => ({
      ...prev,
      [next.pool]: [...prev[next.pool], next.idx],
    }));
    setCurrentQuestion(next.question);
    setQuestionCount((prev) => prev + 1);
    setAnswered(false);
    setSelectedAnswer("");
  };

  const handleFinish = async () => {
    setScreen("loading-explanation");
    setLoadingMessage("Analyzing your answers...");

    await waitIfNeeded(setCountdown);

    try {
      const data = await generateExplanation(concept, level, studyMaterial);

      if (!data) {
        setError("Failed to generate explanation. Please try again.");
        return;
      }

      setExplanationData(data as ExplanationData);
      setScreen("result");
    } catch (e) {
      console.error(e);
      setError("Failed to generate explanation. Please try again.");
    }
  };

  const handleSuggestedQuestion = (q: string) => {
    sessionStorage.setItem("knowfirst_prefill_concept", q);
    onFinish(level, correctCount, levelHistory);
  };

  const handleRestart = () => {
    onFinish(level, correctCount, levelHistory);
  };

  const isCorrect = currentQuestion && selectedAnswer === currentQuestion.correct;
  const progressPercent = (level / 10) * 100;

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

  // Loading screen
  if (screen === "loading" || screen === "loading-explanation") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg space-y-6 text-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-base text-muted-foreground">{loadingMessage}</p>
          </div>
          <CountdownOverlay />
          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" onClick={handleStart} className="mt-3">
                Try Again
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Result screen
  if (screen === "result") {
    const maxLevel = 10;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-2xl space-y-8 text-center">
          {/* Level icon */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="flex flex-col items-center gap-4"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 text-primary">
              {level <= 3 ? (
                <span className="text-3xl">Child</span>
              ) : level <= 6 ? (
                <span className="text-3xl">Beginner</span>
              ) : (
                <span className="text-3xl">Expert</span>
              )}
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              You&apos;re at <span className="text-primary">{getLevelLabel(level)}</span> level
            </h1>
          </motion.div>

          {/* Score pills */}
          <div className="flex items-center justify-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
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
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm text-left">
            {explanationData ? (
              <ExplanationRenderer
                data={explanationData}
                level={level}
                onSuggestedQuestion={handleSuggestedQuestion}
              />
            ) : (
              <p className="text-muted-foreground">No explanation available.</p>
            )}
          </div>

          {/* Restart */}
          <Button
            variant="outline"
            onClick={handleRestart}
            className="h-12 rounded-xl px-8 text-base font-semibold gap-2"
          >
            Try another concept
          </Button>
        </div>
      </div>
    );
  }

  // Quiz screen
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg space-y-6">
        {/* Concept chip + material badge */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <span className="rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary">
            {concept}
          </span>
          {studyMaterial && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
              <FileText className="h-3 w-3" />
              Using your material
            </span>
          )}
        </div>

        {/* Progress bar + level badge */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Level {level}/10</span>
            <span
              className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold transition-colors duration-300 ${getLevelBadgeColor(level)}`}
            >
              {getLevelLabel(level)}
            </span>
          </div>
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
          Question {questionCount} of {TOTAL_QUESTIONS}
        </p>

        {/* Question card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={questionCount}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
            className="rounded-2xl border border-border bg-card p-6 shadow-sm"
          >
            {currentQuestion ? (
              <>
                <h2 className="mb-6 text-xl font-semibold text-card-foreground">
                  {currentQuestion.question}
                </h2>

                <div className="space-y-3">
                  {currentQuestion.options.map((option, i) => {
                    const letter = optionLetters[i];
                    let optionClass =
                      "w-full rounded-xl border-2 px-4 py-3.5 text-left text-sm font-medium transition-all duration-200 ";

                    if (!answered) {
                      optionClass +=
                        "border-border bg-card text-foreground hover:border-primary/50 hover:bg-secondary";
                    } else if (letter === currentQuestion.correct) {
                      optionClass += "border-success bg-success/10 text-success";
                    } else if (letter === selectedAnswer) {
                      optionClass += "border-destructive bg-destructive/10 text-destructive";
                    } else {
                      optionClass += "border-border bg-card text-muted-foreground opacity-50";
                    }

                    return (
                      <button
                        key={letter}
                        onClick={() => handleAnswer(letter)}
                        disabled={answered}
                        className={optionClass}
                      >
                        <span className="flex items-center gap-2">
                          {option}
                          {answered && letter === currentQuestion.correct && (
                            <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-success" />
                          )}
                          {answered &&
                            letter === selectedAnswer &&
                            letter !== currentQuestion.correct && (
                              <XCircle className="ml-auto h-4 w-4 shrink-0 text-destructive" />
                            )}
                        </span>
                      </button>
                    );
                  })}
                </div>

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
                      <p
                        className={`text-sm font-semibold ${isCorrect ? "text-success" : "text-destructive"}`}
                      >
                        {isCorrect ? "Correct!" : "Incorrect"}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {currentQuestion.explanation}
                      </p>
                    </div>
                  </motion.div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading question...</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Next button */}
        {answered && currentQuestion && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Button
              onClick={handleNext}
              className="w-full h-12 rounded-xl text-base font-semibold gap-2"
            >
              {questionCount >= TOTAL_QUESTIONS ? "See Results" : "Next"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default QuizScreen;
