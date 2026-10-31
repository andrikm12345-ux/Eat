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

  it('without emptyAs the 0 comes back (documents why the prop exists)', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const input = screen.getByLabelText('Граммы');
    await user.clear(input);
    expect(input).toHaveValue('0');
  });
});
