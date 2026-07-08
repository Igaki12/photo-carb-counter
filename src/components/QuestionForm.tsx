import type { QuestionDefinition } from "../types/domain";

interface QuestionFormProps {
  questions: QuestionDefinition[];
  values: Record<string, unknown>;
  onChange: (id: string, value: unknown) => void;
}

export function QuestionForm({ questions, values, onChange }: QuestionFormProps) {
  return (
    <div className="question-list">
      {questions.map((question) => (
        <label className="question-card" key={question.id}>
          <span>
            {question.label}
            {question.required ? <b> 必須</b> : null}
          </span>
          {question.kind === "number" ? (
            <div className="inline-input">
              <input
                type="number"
                min="0"
                value={Number(values[question.id] ?? question.defaultValue ?? 0)}
                onChange={(event) => onChange(question.id, Number(event.target.value))}
              />
              {question.unit ? <em>{question.unit}</em> : null}
            </div>
          ) : null}
          {question.kind === "text" ? (
            <input
              type="text"
              value={String(values[question.id] ?? question.defaultValue ?? "")}
              placeholder={question.placeholder}
              onChange={(event) => onChange(question.id, event.target.value)}
            />
          ) : null}
          {question.kind === "single" ? (
            <div className="choice-row">
              {question.options?.map((option) => (
                <button
                  className={values[question.id] === option.value ? "choice is-selected" : "choice"}
                  key={option.value}
                  type="button"
                  onClick={() => onChange(question.id, option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
          {question.kind === "multi" ? (
            <div className="check-grid">
              {question.options?.map((option) => {
                const current = Array.isArray(values[question.id]) ? (values[question.id] as string[]) : [];
                const selected = current.includes(option.value);
                return (
                  <button
                    className={selected ? "choice is-selected" : "choice"}
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(
                        question.id,
                        selected ? current.filter((value) => value !== option.value) : [...current, option.value],
                      );
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </label>
      ))}
    </div>
  );
}
