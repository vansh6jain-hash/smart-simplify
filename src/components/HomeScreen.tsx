import { useState, useRef, useCallback, useEffect } from "react";
import {
  Brain, Sparkles, ArrowRight, Upload, X, FileText,
  CheckCircle2, Loader2, AlertCircle, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { extractTextFromFile } from "@/lib/api";

const quickPicks = ["Black holes", "Machine learning", "Blockchain", "DNA replication"];
const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

type FileStatus = "idle" | "loading" | "ready" | "partial" | "error";

interface HomeScreenProps {
  onStart: (concept: string, studyMaterial: string) => void;
  onExplainMaterial: (studyMaterial: string, concept: string) => void;
}

const HomeScreen = ({ onStart, onExplainMaterial }: HomeScreenProps) => {
  const [concept, setConcept] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [studyMaterial, setStudyMaterial] = useState("");
  const [fileStatus, setFileStatus] = useState<FileStatus>("idle");
  const [fileError, setFileError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [validationError, setValidationError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle pre-fill from suggested questions
  useEffect(() => {
    const prefill = sessionStorage.getItem("knowfirst_prefill_concept");
    if (prefill) {
      setConcept(prefill);
      sessionStorage.removeItem("knowfirst_prefill_concept");
    }
  }, []);

  const handleAction = () => {
    setValidationError("");
    const hasConcept = concept.trim().length > 0;

    // BUG 2 — strict material check: must be "ready" AND have > 50 meaningful chars
    const hasMaterial =
      fileStatus === "ready" && studyMaterial.trim().length > 50;

    // Case 4 — nothing provided
    if (!hasConcept && !hasMaterial) {
      setValidationError("Please enter a concept or upload a file.");
      return;
    }

    // Case 3 — only file (no concept) → skip quiz, deep material explanation
    if (!hasConcept && hasMaterial) {
      onExplainMaterial(studyMaterial, "");
      return;
    }

    // Case 1 & 2 — concept provided (with or without material) → quiz flow
    onStart(concept.trim(), hasMaterial ? studyMaterial : "");
  };

  const processFile = useCallback(async (selectedFile: File) => {
    if (!ACCEPTED_TYPES.includes(selectedFile.type)) {
      setFile(selectedFile);
      setFileError("Unsupported format. Use PDF, PNG, JPG, or WEBP.");
      setFileStatus("error");
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      setFile(selectedFile);
      setFileError("File too large. Max 10MB.");
      setFileStatus("error");
      return;
    }

    setFile(selectedFile);
    setFileStatus("loading");
    setFileError("");
    setValidationError("");
    setStudyMaterial("");

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(selectedFile);
      });

      const data = await extractTextFromFile(base64, selectedFile.type);

      // BUG 1 STEP 5 — validate extracted text on the frontend
      const extracted: string = data.extractedText || "";
      const meaningfulLength = extracted.replace(/\s/g, "").length;

      if (meaningfulLength === 0) {
        // Nothing came back
        setStudyMaterial("");
        setFileStatus("partial");
        setFileError(
          "We couldn't read your file clearly. You can still enter a concept and continue, or try uploading a clearer image of your notes."
        );
      } else if (extracted.trim().length < 50) {
        // Some text but too short to be reliably useful
        setStudyMaterial("");
        setFileStatus("partial");
        setFileError("File partially read — questions may be limited.");
      } else {
        setStudyMaterial(extracted);
        setFileStatus("ready");
      }
    } catch (e: any) {
      console.error(e);
      setStudyMaterial("");
      // If server returned a specific extraction failure message, show it
      const msg: string =
        e?.message ??
        "Could not read file. Try a PNG/JPG image instead.";
      setFileError(msg);
      setFileStatus("error");
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  };

  const removeFile = () => {
    setFile(null);
    setStudyMaterial("");
    setFileStatus("idle");
    setFileError("");
    setValidationError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
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
            Know<span className="text-primary">First</span> AI
          </h1>
          <p className="text-muted-foreground text-lg">Learn at Your True Level</p>
        </div>

        {/* Concept input */}
        <div className="space-y-3">
          <div className="relative">
            <Input
              placeholder="Enter a concept to learn…"
              value={concept}
              onChange={(e) => { setConcept(e.target.value); setValidationError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleAction()}
              className="h-14 rounded-xl border-2 border-border bg-card pl-4 pr-36 text-lg shadow-sm transition-colors focus-visible:border-primary"
            />
            <Button
              onClick={handleAction}
              disabled={fileStatus === "loading"}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-10 rounded-lg px-4 text-sm font-semibold"
            >
              Start / Explain
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>

          {/* Validation error */}
          {validationError && (
            <p className="flex items-center justify-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {validationError}
            </p>
          )}

          {/* Quick picks */}
          {fileStatus !== "ready" && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              {quickPicks.map((pick) => (
                <button
                  key={pick}
                  onClick={() => { setConcept(pick); setValidationError(""); }}
                  className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground transition-all hover:border-primary hover:bg-secondary hover:text-primary"
                >
                  {pick}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* File upload */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            Enter a concept, upload your notes, or both — KnowFirst AI adapts to what you know.
          </p>

          {/* Upload zone — always visible, hidden only when file is set and status is loading/ready/partial */}
          {!file ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed p-6 transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drag & drop or <span className="text-primary font-medium">browse</span>
                </p>
                <p className="text-xs text-muted-foreground">PDF, PNG, JPG, WEBP · Max 10MB</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <div className={`flex items-center gap-3 rounded-xl border p-4 ${
                fileStatus === "ready"
                  ? "border-emerald-200 bg-emerald-50"
                  : fileStatus === "partial"
                  ? "border-amber-200 bg-amber-50"
                  : fileStatus === "error"
                  ? "border-destructive/30 bg-destructive/5"
                  : "border-border bg-card"
              }`}>
                <FileText className={`h-5 w-5 shrink-0 ${
                  fileStatus === "ready" ? "text-emerald-600"
                  : fileStatus === "partial" ? "text-amber-600"
                  : fileStatus === "error" ? "text-destructive"
                  : "text-muted-foreground"
                }`} />
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium truncate">{file.name}</p>

                  {fileStatus === "loading" && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      <span className="text-xs text-muted-foreground">Reading your file…</span>
                    </div>
                  )}

                  {fileStatus === "ready" && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      <span className="text-xs text-emerald-700 font-medium">Ready</span>
                    </div>
                  )}

                  {fileStatus === "partial" && (
                    <div className="flex items-start gap-1.5 mt-1">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-600" />
                      <span className="text-xs text-amber-700">{fileError}</span>
                    </div>
                  )}

                  {fileStatus === "error" && (
                    <div className="flex items-start gap-1.5 mt-1">
                      <AlertCircle className="h-3 w-3 mt-0.5 shrink-0 text-destructive" />
                      <span className="text-xs text-destructive">{fileError}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={removeFile}
                  className="shrink-0 rounded-lg p-1 hover:bg-black/10 transition-colors"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {/* Re-upload zone when error */}
              {(fileStatus === "error") && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer rounded-xl border-2 border-dashed border-border p-4 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Upload className="h-4 w-4" />
                    <span>Try a different file</span>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              )}
            </div>
          )}

          {/* Hint when file is ready with no concept */}
          {fileStatus === "ready" && !concept.trim() && (
            <p className="text-xs text-primary font-medium">
              No concept entered — clicking "Start / Explain" will give you a full breakdown of your material.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomeScreen;
