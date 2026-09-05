import type {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

interface BaseProps {
  label: string;
  name: string;
  error?: string;
  hint?: ReactNode;
}

export function TextField({
  label,
  name,
  error,
  hint,
  ...rest
}: BaseProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        aria-invalid={error ? "true" : undefined}
        {...rest}
      />
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

export function TextAreaField({
  label,
  name,
  error,
  hint,
  ...rest
}: BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <textarea
        id={name}
        name={name}
        aria-invalid={error ? "true" : undefined}
        {...rest}
      />
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}
