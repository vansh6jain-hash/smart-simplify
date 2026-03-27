import { useState } from "react";
import HomeScreen from "@/components/HomeScreen";
import QuizScreen from "@/components/QuizScreen";
import ResultScreen from "@/components/ResultScreen";

type Screen = "home" | "quiz" | "result";

const Index = () => {
  const [screen, setScreen] = useState<Screen>("home");
  const [concept, setConcept] = useState("");
  const [finalLevel, setFinalLevel] = useState(5);
  const [correctCount, setCorrectCount] = useState(0);

  const handleStart = (c: string) => {
    setConcept(c);
    setScreen("quiz");
  };

  const handleFinish = (level: number, correct: number) => {
    setFinalLevel(level);
    setCorrectCount(correct);
    setScreen("result");
  };

  const handleRestart = () => {
    setConcept("");
    setFinalLevel(5);
    setCorrectCount(0);
    setScreen("home");
  };

  if (screen === "quiz") return <QuizScreen concept={concept} onFinish={handleFinish} />;
  if (screen === "result")
    return <ResultScreen concept={concept} level={finalLevel} correctCount={correctCount} onRestart={handleRestart} />;
  return <HomeScreen onStart={handleStart} />;
};

export default Index;
