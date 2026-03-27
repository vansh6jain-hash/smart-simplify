import { XCircle } from "lucide-react";

export interface ExplanationSection {
  heading: string;
  type: "text" | "bullets" | "table" | "keyvalue" | string;
  content: unknown;
}

export interface ExplanationData {
  title?: string;
  summary?: string;
  sections?: ExplanationSection[];
  key_terms?: { term: string; definition: string }[];
  key_takeaways?: string[];
  common_misconceptions?: string[];
  suggested_questions?: string[];
}

interface ExplanationRendererProps {
  data: ExplanationData;
  level?: number;
  onSuggestedQuestion?: (q: string) => void;
}

function getLevelAccent(level?: number) {
  if (level === undefined)
    return {
      title: "text-foreground",
      border: "border-primary",
      summaryBg: "bg-primary/5",
      headerBg: "bg-primary/10",
      headerText: "text-primary",
      bullet: "bg-primary",
      numberText: "text-primary",
      keyText: "text-primary",
      chip: "bg-primary/10 text-primary hover:bg-primary/20 border-primary/20",
      badge: null,
    };
  if (level <= 3)
    return {
      title: "text-emerald-700",
      border: "border-emerald-400",
      summaryBg: "bg-emerald-50",
      headerBg: "bg-emerald-100",
      headerText: "text-emerald-800",
      bullet: "bg-emerald-500",
      numberText: "text-emerald-600",
      keyText: "text-emerald-700",
      chip: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200",
      badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    };
  if (level <= 6)
    return {
      title: "text-amber-700",
      border: "border-amber-400",
      summaryBg: "bg-amber-50",
      headerBg: "bg-amber-100",
      headerText: "text-amber-800",
      bullet: "bg-amber-500",
      numberText: "text-amber-600",
      keyText: "text-amber-700",
      chip: "bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200",
      badge: "bg-amber-100 text-amber-700 border-amber-200",
    };
  return {
    title: "text-violet-700",
    border: "border-violet-400",
    summaryBg: "bg-violet-50",
    headerBg: "bg-violet-100",
    headerText: "text-violet-800",
    bullet: "bg-violet-500",
    numberText: "text-violet-600",
    keyText: "text-violet-700",
    chip: "bg-violet-50 text-violet-700 hover:bg-violet-100 border-violet-200",
    badge: "bg-violet-100 text-violet-700 border-violet-200",
  };
}

function getLevelLabel(level: number) {
  if (level <= 3) return "Child";
  if (level <= 6) return "Beginner";
  return "Expert";
}

function SectionContent({
  section,
  accent,
}: {
  section: ExplanationSection;
  accent: ReturnType<typeof getLevelAccent>;
}) {
  const { type, content } = section;

  if (type === "text") {
    return (
      <p className="text-base leading-[1.8] text-card-foreground">
        {typeof content === "string" ? content : JSON.stringify(content)}
      </p>
    );
  }

  if (type === "bullets") {
    const items = Array.isArray(content) ? content : [];
    return (
      <ul className="space-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              className={`mt-2 h-2 w-2 shrink-0 rounded-sm ${accent.bullet}`}
            />
            <span className="text-base leading-[1.7] text-card-foreground">
              {String(item)}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  if (type === "table") {
    const tableData = content as { headers?: string[]; rows?: string[][] };
    const headers = tableData?.headers ?? [];
    const rows = tableData?.rows ?? [];
    return (
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className={accent.headerBg}>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className={`px-4 py-3 text-left font-semibold ${accent.headerText} border-b border-border`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={ri}
                className={ri % 2 === 0 ? "bg-card" : "bg-muted/40"}
              >
                {(Array.isArray(row) ? row : []).map((cell, ci) => (
                  <td
                    key={ci}
                    className="px-4 py-3 text-card-foreground border-b border-border/50 last:border-b-0"
                  >
                    {String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === "keyvalue") {
    const pairs = Array.isArray(content)
      ? (content as { key: string; value: string }[])
      : [];
    return (
      <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
        {pairs.map((pair, i) => (
          <div key={i} className="flex gap-4 px-4 py-3 bg-card">
            <span className={`font-semibold shrink-0 w-36 ${accent.keyText}`}>
              {pair.key}
            </span>
            <span className="text-card-foreground">{pair.value}</span>
          </div>
        ))}
      </div>
    );
  }

  // fallback
  return (
    <p className="text-base leading-[1.8] text-card-foreground">
      {typeof content === "string" ? content : JSON.stringify(content)}
    </p>
  );
}

export default function ExplanationRenderer({
  data,
  level,
  onSuggestedQuestion,
}: ExplanationRendererProps) {
  const accent = getLevelAccent(level);

  return (
    <div className="space-y-6 text-left">
      {/* Level badge */}
      {level !== undefined && accent.badge && (
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold ${accent.badge}`}
          >
            {getLevelLabel(level)} level explanation
          </span>
        </div>
      )}

      {/* Title */}
      {data.title && (
        <h2 className={`text-2xl font-bold tracking-tight ${accent.title}`}>
          {data.title}
        </h2>
      )}

      {/* Summary */}
      {data.summary && (
        <div
          className={`rounded-xl border-l-4 ${accent.border} ${accent.summaryBg} px-5 py-4`}
        >
          <p className="italic text-base leading-relaxed text-card-foreground">
            {data.summary}
          </p>
        </div>
      )}

      {/* Sections */}
      {Array.isArray(data.sections) && data.sections.length > 0 && (
        <div className="space-y-6">
          {data.sections.map((section, i) => (
            <div key={i} className="space-y-3">
              <h3 className="text-base font-semibold text-card-foreground">
                {section.heading}
              </h3>
              <SectionContent section={section} accent={accent} />
            </div>
          ))}
        </div>
      )}

      {/* Key Terms */}
      {Array.isArray(data.key_terms) && data.key_terms.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-card-foreground">
            Key Terms
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.key_terms.map((kt, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-card p-4"
              >
                <p className={`font-semibold text-sm ${accent.keyText}`}>
                  {kt.term}
                </p>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  {kt.definition}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key Takeaways */}
      {Array.isArray(data.key_takeaways) && data.key_takeaways.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-card-foreground">
            Key Takeaways
          </h3>
          <ol className="space-y-2">
            {data.key_takeaways.map((item, i) => (
              <li key={i} className="flex items-start gap-4 py-2">
                <span
                  className={`text-2xl font-bold leading-none shrink-0 ${accent.numberText}`}
                >
                  {i + 1}
                </span>
                <span className="text-base leading-[1.7] text-card-foreground">
                  {item}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Common Misconceptions */}
      {Array.isArray(data.common_misconceptions) &&
        data.common_misconceptions.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-card-foreground">
              Common Misconceptions
            </h3>
            <div className="space-y-2">
              {data.common_misconceptions.map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-100 px-4 py-3"
                >
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <span className="text-sm leading-relaxed text-red-800">
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      {/* Suggested Questions */}
      {Array.isArray(data.suggested_questions) &&
        data.suggested_questions.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-card-foreground">
              Want to go deeper? Try these questions
            </h3>
            <div className="flex flex-wrap gap-2">
              {data.suggested_questions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => onSuggestedQuestion?.(q)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${accent.chip}`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
