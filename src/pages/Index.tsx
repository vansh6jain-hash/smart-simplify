import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import HomeScreen from "@/components/HomeScreen";
import QuizScreen from "@/components/QuizScreen";
import ResultScreen from "@/components/ResultScreen";

type Screen = "home" | "quiz" | "result";

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.2, ease: "easeIn" } },
};

const Index = () => {
  const [screen, setScreen] = useState<Screen>("home");
  const [concept, setConcept] = useState("");
  const [finalLevel, setFinalLevel] = useState(5);
  const [correctCount, setCorrectCount] = useState(0);
  const [levelHistory, setLevelHistory] = useState<number[]>([]);

  const handleStart = (c: string) => {
    setConcept(c);
    setLevelHistory([]);
    setScreen("quiz");
  };

  const handleFinish = (level: number, correct: number, history: number[]) => {
    setFinalLevel(level);
    setCorrectCount(correct);
    setLevelHistory(history);
    setScreen("result");
  };

  const handleRestart = () => {
    setConcept("");
    setFinalLevel(5);
    setCorrectCount(0);
    setLevelHistory([]);
    setScreen("home");
  };

  return (
    <AnimatePresence mode="wait">
      {screen === "home" && (
        <motion.div key="home" variants={pageVariants} initial="initial" animate="animate" exit="exit">
          <HomeScreen onStart={handleStart} />
        </motion.div>
      )}
      {screen === "quiz" && (
        <motion.div key="quiz" variants={pageVariants} initial="initial" animate="animate" exit="exit">
          <QuizScreen concept={concept} onFinish={handleFinish} />
        </motion.div>
      )}
      {screen === "result" && (
        <motion.div key="result" variants={pageVariants} initial="initial" animate="animate" exit="exit">
          <ResultScreen concept={concept} level={finalLevel} correctCount={correctCount} levelHistory={levelHistory} onRestart={handleRestart} />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Index;
