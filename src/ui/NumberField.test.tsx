import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { NumberField } from './kit';

/** A parent that stores an empty field as 0, like the review screen does for grams. */
function Host({ emptyAs }: { emptyAs?: number }) {
  const [grams, setGrams] = useState(0);
  return (
    <>
      <NumberField
        label="Граммы"
        value={grams}
        {...(emptyAs !== undefined ? { emptyAs } : {})}
        onChange={(v) => setGrams(v ?? 0)}
      />
      <output data-testid="grams">{grams}</output>
    </>
  );
}

describe('NumberField', () => {
  it('lets you erase a 0 and type a new number when the parent maps empty to 0', async () => {
    const user = userEvent.setup();
    render(<Host emptyAs={0} />);
    const input = screen.getByLabelText('Граммы');
    expect(input).toHaveValue('0');
    await user.clear(input);
    expect(input).toHaveValue('');
    await user.type(input, '950');
    expect(input).toHaveValue('950');
    expect(screen.getByTestId('grams')).toHaveTextContent('950');
  });

  it('also without emptyAs an erased 0 stays erased while you type', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const input = screen.getByLabelText('Граммы');
    await user.clear(input);
    expect(input).toHaveValue('');
    await user.type(input, '75');
    expect(input).toHaveValue('75');
    expect(screen.getByTestId('grams')).toHaveTextContent('75');
  });

  it('a parent that ignores an empty value: the field can be erased and retyped, and shows the stored value on blur', async () => {
    const user = userEvent.setup();
    function Strict() {
      const [grams, setGrams] = useState(4);
      return (
        <>
          <NumberField
            label="Граммы"
            value={grams}
            onChange={(v) => v !== null && v > 0 && setGrams(v)}
          />
          <output data-testid="grams">{grams}</output>
        </>
      );
    }
    render(<Strict />);
    const input = screen.getByLabelText('Граммы');
    await user.clear(input);
    expect(input).toHaveValue('');
    await user.type(input, '25');
    expect(input).toHaveValue('25');
    expect(screen.getByTestId('grams')).toHaveTextContent('25');
    // Erase and leave the field empty: the real value comes back.
    await user.clear(input);
    await user.tab();
    expect(input).toHaveValue('25');
  });

  it('shows a value changed from outside', async () => {
    const user = userEvent.setup();
    function Outer() {
      const [v, setV] = useState<number | null>(5);
      return (
        <>
          <NumberField label="Граммы" value={v} onChange={setV} />
          <button type="button" onClick={() => setV(9.5)}>
            set
          </button>
        </>
      );
    }
    render(<Outer />);
    await user.click(screen.getByRole('button', { name: 'set' }));
    expect(screen.getByLabelText('Граммы')).toHaveValue('9,5');
  });
});
