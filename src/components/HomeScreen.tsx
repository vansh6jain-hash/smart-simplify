import { useState } from "react";
import { Brain, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const quickPicks = ["Black holes", "Machine learning", "Blockchain", "DNA replication"];

interface HomeScreenProps {
  onStart: (concept: string) => void;
}

const HomeScreen = ({ onStart }: HomeScreenProps) => {
  const [concept, setConcept] = useState("");

  const handleStart = () => {
    if (concept.trim()) onStart(concept.trim());
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-lg space-y-8 text-center">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Brain className="h-8 w-8" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">
            Explain<span className="text-primary">Like</span>AI
          </h1>
          <p className="text-muted-foreground text-lg">
            We assess your level, then explain any concept just right.
          </p>
        </div>

        {/* Input */}
        <div className="space-y-3">
          <div className="relative">
            <Input
              placeholder="Enter a concept to learn…"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleStart()}
              className="h-14 rounded-xl border-2 border-border bg-card pl-4 pr-14 text-lg shadow-sm transition-colors focus-visible:border-primary"
            />
            <Button
              size="icon"
              onClick={handleStart}
              disabled={!concept.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-lg"
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
          </div>

          {/* Quick picks */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            {quickPicks.map((pick) => (
              <button
                key={pick}
                onClick={() => { setConcept(pick); onStart(pick); }}
                className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground transition-all hover:border-primary hover:bg-secondary hover:text-primary"
              >
                {pick}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomeScreen;
