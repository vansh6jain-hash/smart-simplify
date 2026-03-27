import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import HomeScreen from "@/components/HomeScreen";
import QuizScreen from "@/components/QuizScreen";
import ResultScreen from "@/components/ResultScreen";
import MaterialExplainScreen from "@/components/MaterialExplainScreen";

type Screen = "home" | "quiz" | "result" | "material-explain";

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as const } },
};

const Index = () => {
  const [screen, setScreen] = useState<Screen>("home");
  const [concept, setConcept] = useState("");
  const [studyMaterial, setStudyMaterial] = useState("");
  const [finalLevel, setFinalLevel] = useState(5);
  const [correctCount, setCorrectCount] = useState(0);
  const [levelHistory, setLevelHistory] = useState<number[]>([]);

  const handleStart = (c: string, material: string) => {
    setConcept(c);
    setStudyMaterial(material);
    setLevelHistory([]);
    setScreen("quiz");
  };

  const handleExplainMaterial = (material: string, c: string) => {
    setStudyMaterial(material);
    setConcept(c);
    setScreen("material-explain");
  };

  const handleFinish = (level: number, correct: number, history: number[]) => {
    setFinalLevel(level);
    setCorrectCount(correct);
    setLevelHistory(history);
    setScreen("result");
  };

  const handleRestart = () => {
    setConcept("");
    setStudyMaterial("");
    setFinalLevel(5);
    setCorrectCount(0);
    setLevelHistory([]);
    setScreen("home");
  };

  return (
    <AnimatePresence mode="wait">
      {screen === "home" && (
        <motion.div key="home" variants={pageVariants} initial="initial" animate="animate" exit="exit">
          <HomeScreen onStart={handleStart} onExplainMaterial={handleExplainMaterial} />
        </motion.div>
      )}
      {screen === "quiz" && (
        <motion.div key="quiz" variants={pageVariants} initial="initial" animate="animate" exit="exit">
          <QuizScreen concept={concept} studyMaterial={studyMaterial} onFinish={handleFinish} />
        </motion.div>
      )}
      {screen === "result" && (
        <motion.div key="result" variants={pageVariants} initial="initial" animate="animate" exit="exit">
          <ResultScreen concept={concept} level={finalLevel} correctCount={correctCount} levelHistory={levelHistory} studyMaterial={studyMaterial} onRestart={handleRestart} />
        </motion.div>
      )}
      {screen === "material-explain" && (
        <motion.div key="material-explain" variants={pageVariants} initial="initial" animate="animate" exit="exit">
          <MaterialExplainScreen studyMaterial={studyMaterial} concept={concept} onRestart={handleRestart} />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Index;
