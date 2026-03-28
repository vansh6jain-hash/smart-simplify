import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import HomeScreen from "@/components/HomeScreen";
import QuizScreen from "@/components/QuizScreen";
import MaterialExplainScreen from "@/components/MaterialExplainScreen";

type Screen = "home" | "quiz" | "material-explain";

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as const } },
};

const Index = () => {
  const [screen, setScreen] = useState<Screen>("home");
  const [concept, setConcept] = useState("");
  const [studyMaterial, setStudyMaterial] = useState("");

  const handleStart = (c: string, material: string) => {
    setConcept(c);
    setStudyMaterial(material);
    setScreen("quiz");
  };

  const handleExplainMaterial = (material: string, c: string) => {
    setStudyMaterial(material);
    setConcept(c);
    setScreen("material-explain");
  };

  const handleFinish = () => {
    // Called when quiz is complete - just return to home
    setConcept("");
    setStudyMaterial("");
    setScreen("home");
  };

  const handleRestart = () => {
    setConcept("");
    setStudyMaterial("");
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
      {screen === "material-explain" && (
        <motion.div key="material-explain" variants={pageVariants} initial="initial" animate="animate" exit="exit">
          <MaterialExplainScreen studyMaterial={studyMaterial} concept={concept} onRestart={handleRestart} />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Index;
