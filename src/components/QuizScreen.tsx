import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, ArrowRight } from "lucide-react";

const mockQuestion = {
  question: "What is gravity?",
  options: ["A) A force", "B) A color", "C) A sound", "D) A shape"],
  correct: "A",
  explanation: "Gravity is the force that pulls objects toward each other.",
};

const optionLetters = ["A", "B", "C", "D"];

function getLevelLabel(level: number) {
  if (level <= 3) return "Child";
  if (level <= 6) return "Beginner";
  return "Expert";
}

function getLevelColor(level: number) {
  if (level <= 3) return "bg-amber-100 text-amber-700 border-amber-200";
  if (level <= 6) return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-primary/10 text-primary border-primary/20";
}

interface QuizScreenProps {
  concept: string;
  onFinish: (level: number, correct: number) => void;
}

const QuizScreen = ({ concept, onFinish }: QuizScreenProps) => {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [level, setLevel] = useState(5);
  const [correctCount, setCorrectCount] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);

  const handleSelect = (letter: string) => {
    if (answered) return;
    setSelectedAnswer(letter);
    setAnswered(true);
    if (letter === mockQuestion.correct) {
      setCorrectCount((c) => c + 1);
      setLevel((l) => Math.min(10, l + 1));
    } else {
      setLevel((l) => Math.max(1, l - 1));
    }
  };

  const handleNext = () => {
    if (currentQuestion >= 9) {
      const finalLevel = selectedAnswer === mockQuestion.correct
        ? Math.min(10, level)
        : Math.max(1, level);
      onFinish(finalLevel, correctCount + (selectedAnswer === mockQuestion.correct ? 0 : 0));
      return;
    }
    setCurrentQuestion((q) => q + 1);
    setSelectedAnswer(null);
    setAnswered(false);
  };

  const isCorrect = selectedAnswer === mockQuestion.correct;

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
            <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold ${getLevelColor(level)}`}>
              {getLevelLabel(level)}
            </span>
          </div>
          <Progress value={(currentQuestion + 1) * 10} className="h-2" />
        </div>

        {/* Question counter */}
        <p className="text-center text-sm font-medium text-muted-foreground">
          Question {currentQuestion + 1} of 10
        </p>

        {/* Question card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-6 text-xl font-semibold text-card-foreground">
            {mockQuestion.question}
          </h2>

          <div className="space-y-3">
            {mockQuestion.options.map((option, i) => {
              const letter = optionLetters[i];
              let optionClass =
                "w-full rounded-xl border-2 px-4 py-3.5 text-left text-sm font-medium transition-all ";

              if (!answered) {
                optionClass +=
                  selectedAnswer === letter
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-secondary";
              } else if (letter === mockQuestion.correct) {
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
                  {option}
                </button>
              );
            })}
          </div>

          {/* Feedback */}
          {answered && (
            <div className={`mt-5 flex items-start gap-3 rounded-xl p-4 ${isCorrect ? "bg-success/10" : "bg-destructive/10"}`}>
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
                  {mockQuestion.explanation}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Next button */}
        {answered && (
          <Button onClick={handleNext} className="w-full h-12 rounded-xl text-base font-semibold gap-2">
            {currentQuestion >= 9 ? "See Results" : "Next"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default QuizScreen;
