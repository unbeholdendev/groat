import { type ComponentProps, createContext, type ReactNode, use, useId } from "react";

const Described = createContext<string | undefined>(undefined);

const aria = (errorId: string | undefined) => ({
  "aria-invalid": errorId ? true : undefined,
  "aria-describedby": errorId,
});

export function Field({
  label,
  error,
  className = "",
  children,
}: {
  label?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className={`label ${className}`}>
      <label className="flex flex-col gap-1.5">
        {label}
        <Described value={error ? id : undefined}>{children}</Described>
      </label>
      {error && (
        <span id={id} className="text-up">
          {error}
        </span>
      )}
    </div>
  );
}

export const Input = ({ className = "", ...props }: ComponentProps<"input">) => (
  <input className={`input ${className}`} {...aria(use(Described))} {...props} />
);

export const Select = ({ className = "", ...props }: ComponentProps<"select">) => (
  <select className={`input ${className}`} {...aria(use(Described))} {...props} />
);

export const FormError = ({ error, className = "" }: { error?: { message?: string } | null; className?: string }) =>
  error?.message ? (
    <p role="alert" className={`text-sm text-up ${className}`}>
      {error.message}
    </p>
  ) : null;
