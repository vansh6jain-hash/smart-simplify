import { useState, useRef, useCallback } from "react";
import { Brain, Sparkles, ArrowRight, Upload, X, FileText, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { extractTextFromFile } from "@/lib/api";

const quickPicks = ["Black holes", "Machine learning", "Blockchain", "DNA replication"];
const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface HomeScreenProps {
  onStart: (concept: string, studyMaterial: string) => void;
}

const HomeScreen = ({ onStart }: HomeScreenProps) => {
  const [concept, setConcept] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [studyMaterial, setStudyMaterial] = useState("");
  const [fileStatus, setFileStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [fileError, setFileError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleStart = () => {
    if (concept.trim()) onStart(concept.trim(), studyMaterial);
  };

  const processFile = useCallback(async (selectedFile: File) => {
    if (!ACCEPTED_TYPES.includes(selectedFile.type)) {
      setFileError("Unsupported format. Use PDF, PNG, JPG, or WEBP.");
      setFileStatus("error");
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      setFileError("File too large. Max 10MB.");
      setFileStatus("error");
      return;
    }

    setFile(selectedFile);
    setFileStatus("loading");
    setFileError("");

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
      setStudyMaterial(data.extractedText || "");
      setFileStatus("ready");
    } catch (e) {
      console.error(e);
      setFileError("Could not read file. Questions will use concept only.");
      setStudyMaterial("");
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
          <p className="text-muted-foreground text-lg">
            Learn at Your True Level
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
                onClick={() => { setConcept(pick); onStart(pick, studyMaterial); }}
                className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground transition-all hover:border-primary hover:bg-secondary hover:text-primary"
              >
                {pick}
              </button>
            ))}
          </div>
        </div>

        {/* File upload */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Upload your study material (optional)</p>

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
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium truncate">{file.name}</p>
                {fileStatus === "loading" && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    <span className="text-xs text-muted-foreground">Reading your material…</span>
                  </div>
                )}
                {fileStatus === "ready" && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    <span className="text-xs text-emerald-600 font-medium">Material ready</span>
                  </div>
                )}
                {fileStatus === "error" && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <AlertCircle className="h-3 w-3 text-destructive" />
                    <span className="text-xs text-destructive">{fileError}</span>
                  </div>
                )}
              </div>
              <button onClick={removeFile} className="shrink-0 rounded-lg p-1 hover:bg-secondary transition-colors">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomeScreen;
