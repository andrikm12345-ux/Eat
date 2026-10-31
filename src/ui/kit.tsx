import {
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { Link } from 'react-router';
import { parseDecimal } from '../domain/format';
import styles from './kit.module.css';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  block?: boolean;
};

export function Button({ variant = 'primary', block, className, ...rest }: ButtonProps) {
  const cls = [styles.button, styles[variant], block ? styles.block : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return <button type="button" className={cls} {...rest} />;
}

export function LinkButton({
  to,
  variant = 'primary',
  block,
  children,
}: {
  to: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  block?: boolean;
  children: ReactNode;
}) {
  const cls = [styles.button, styles[variant], block ? styles.block : ''].filter(Boolean).join(' ');
  return (
    <Link to={to} className={cls}>
      {children}
    </Link>
  );
}

export function Card({
  title,
  children,
  className,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className ? `${styles.card} ${className}` : styles.card}>
      {title ? <h2 className={styles.cardTitle}>{title}</h2> : null}
      {children}
    </section>
  );
}

type FieldShellProps = {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  suffix?: string;
  id: string;
  children: ReactNode;
};

function FieldShell({ label, hint, error, suffix, id, children }: FieldShellProps) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.inputWrap}>
        {children}
        {suffix ? <span className={styles.suffix}>{suffix}</span> : null}
      </div>
      {error ? <span className={styles.error}>{error}</span> : null}
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  );
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  error?: string | null;
  suffix?: string;
};

export function TextField({
  label,
  value,
  onChange,
  hint,
  error,
  suffix,
  ...rest
}: TextFieldProps) {
  const id = useId();
  return (
    <FieldShell label={label} hint={hint} error={error} suffix={suffix} id={id}>
      <input
        id={id}
        className={styles.input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
    </FieldShell>
  );
}

type NumberFieldProps = {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  suffix?: string;
  hint?: ReactNode;
  error?: string | null;
  min?: number;
  max?: number;
  autoFocus?: boolean;
  placeholder?: string;
  /** The parent stores an empty field as this number (e.g. 0): don't write it back into the input. */
  emptyAs?: number;
};

const toText = (v: number | null) => (v === null ? '' : String(v).replace('.', ','));

/** Decimal input that accepts both comma and dot; reports `null` when empty/invalid. */
export function NumberField({
  label,
  value,
  onChange,
  suffix,
  hint,
  error,
  emptyAs,
  ...rest
}: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(() => toText(value));
  // Sync from outside only when the numeric value really changed.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    const emptyStays = emptyAs !== undefined && value === emptyAs && text.trim() === '';
    if (parseDecimal(text) !== value && !emptyStays) setText(toText(value));
  }
  return (
    <FieldShell label={label} hint={hint} error={error} suffix={suffix} id={id}>
      <input
        id={id}
        className={styles.input}
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseDecimal(e.target.value);
          setLastValue(v);
          onChange(v);
        }}
        {...rest}
      />
    </FieldShell>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={`${styles.segment} ${o.value === value ? styles.segmentActive : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function OptionList<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; title: string; hint?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className={styles.options} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={`${styles.option} ${o.value === value ? styles.optionActive : ''}`}
          onClick={() => onChange(o.value)}
        >
          <span className={styles.optionTitle}>{o.title}</span>
          {o.hint ? <span className={styles.optionHint}>{o.hint}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T | null;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className={styles.chips} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={`${styles.chip} ${o.value === value ? styles.chipActive : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Notice({
  children,
  tone = 'attention',
}: {
  children: ReactNode;
  tone?: 'attention' | 'info';
}) {
  return (
    <div className={tone === 'info' ? styles.info : styles.notice} role="note">
      {children}
    </div>
  );
}

export function Stat({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className={styles.stat}>
      <span>{label}</span>
      <span className={styles.statValue}>{value}</span>
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className={styles.row}>{children}</div>;
}

export function Switch({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div>
      <label className={styles.switchRow} htmlFor={id}>
        <span>{label}</span>
        <input
          id={id}
          type="checkbox"
          role="switch"
          className={styles.switch}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  );
}

/** Collapsible section (native details/summary: accessible, no JS state). */
export function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className={styles.collapsible}>
      <summary className={styles.collapsibleSummary}>{title}</summary>
      <div className={styles.collapsibleBody}>{children}</div>
    </details>
  );
}
