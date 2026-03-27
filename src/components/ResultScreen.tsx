import { Brain, Baby, BookOpen, GraduationCap, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

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

function getExplanation(concept: string, level: number) {
  const label = getLevelLabel(level);
  if (label === "Child")
    return `Imagine ${concept} is like a magic trick that happens in nature! It's something really cool that scientists study to understand how the world works.`;
  if (label === "Beginner")
    return `${concept} is a fundamental concept that involves specific processes and principles. It plays an important role in its field and understanding it helps build a foundation for more advanced topics.`;
  return `${concept} involves complex mechanisms and interactions at multiple scales. A deep understanding requires grasping the underlying mathematical frameworks, empirical evidence, and current research frontiers.`;
}

interface ResultScreenProps {
  concept: string;
  level: number;
  correctCount: number;
  onRestart: () => void;
}

const ResultScreen = ({ concept, level, correctCount, onRestart }: ResultScreenProps) => {
  const label = getLevelLabel(level);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg space-y-8 text-center">
        {/* Level icon */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 text-primary">
            {getLevelIcon(level)}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            You're at <span className="text-primary">{label}</span> level
          </h1>
        </div>

        {/* Score pills */}
        <div className="flex items-center justify-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
            <Brain className="h-4 w-4" />
            Level {level}/10
          </span>
          <span className="inline-flex items-center rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground">
            Score: {correctCount}/10
          </span>
        </div>

        {/* Explanation card */}
        <div className="rounded-2xl border border-border bg-card p-6 text-left shadow-sm">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {concept} — explained for {label.toLowerCase()} level
          </h3>
          <p className="text-base leading-relaxed text-card-foreground">
            {getExplanation(concept, level)}
          </p>
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
