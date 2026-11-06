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

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  block?: boolean;
  /** Shown under a disabled button: what is still missing. */
  hint?: ReactNode;
};

export function Button({ variant = 'primary', block, className, hint, ...rest }: ButtonProps) {
  const cls = [styles.button, styles[variant], block ? styles.block : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  const button = <button type="button" className={cls} {...rest} />;
  if (!hint || !rest.disabled) return button;
  return (
    <div className={block ? styles.hintWrapBlock : styles.hintWrap}>
      {button}
      <p className={styles.btnHint} role="note">
        {hint}
      </p>
    </div>
  );
}

export function LinkButton({
  to,
  variant = 'primary',
  block,
  children,
}: {
  to: string;
  variant?: ButtonVariant;
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

/** Soft colour of a card, by what it is about. */
export type Tone =
  'food' | 'weight' | 'water' | 'activity' | 'sun' | 'rose' | 'sand' | 'mint' | 'sky';

export function Card({
  title,
  children,
  className,
  tone,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: Tone;
}) {
  return (
    <section
      className={[styles.card, tone ? styles[`tone-${tone}`] : '', className]
        .filter(Boolean)
        .join(' ')}
    >
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
      <div className={error ? `${styles.inputWrap} ${styles.invalid}` : styles.inputWrap}>
        {children}
        {suffix ? <span className={styles.suffix}>{suffix}</span> : null}
      </div>
      {error ? (
        <span className={styles.error} role="alert">
          {error}
        </span>
      ) : null}
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
  /** Accessible name when it should be longer than the visible label. */
  ariaLabel?: string;
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
  ariaLabel,
  ...rest
}: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(() => toText(value));
  // Follow the parent only when the value it passes really changes. An emptied field stays
  // empty while the parent stands in "nothing" with 0 / null / `emptyAs`, so a number can
  // always be erased and typed anew; a parent that ignores an empty value is handled on blur.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    const standIn = value === null || value === 0 || value === emptyAs;
    const emptyStays = standIn && text.trim() === '';
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
        {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseDecimal(e.target.value));
        }}
        onBlur={() => {
          // Leaving the field shows what is really stored (e.g. an ignored empty value).
          if (
            parseDecimal(text) !== value &&
            !(text.trim() === '' && (value === null || value === 0 || value === emptyAs))
          )
            setText(toText(value));
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
      <span
        className={styles.thumb}
        aria-hidden="true"
        style={{
          width: `calc((100% - ${2 * 4 + (options.length - 1) * 4}px) / ${options.length})`,
          transform: `translateX(calc(${Math.max(
            0,
            options.findIndex((o) => o.value === value),
          )} * (100% + var(--sp-1))))`,
        }}
      />
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
      <span className={styles.statLabel}>{label}</span>
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
