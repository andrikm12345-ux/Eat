import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ru } from '../i18n/ru';
import { DateField, TimeField } from './DateTimeFields';

const t = ru.dateTime;

function DateHost({
  start = '2026-11-01',
  max,
  allowEmpty,
}: {
  start?: string;
  max?: string;
  allowEmpty?: boolean;
}) {
  const [v, setV] = useState(start);
  return (
    <>
      <DateField
        label="Дата"
        value={v}
        onChange={setV}
        {...(max ? { max } : {})}
        {...(allowEmpty ? { allowEmpty } : {})}
      />
      <output data-testid="v">{v}</output>
    </>
  );
}

function TimeHost() {
  const [v, setV] = useState('06:00');
  return (
    <>
      <TimeField label="Время" value={v} onChange={setV} />
      <output data-testid="v">{v}</output>
    </>
  );
}

describe('DateField', () => {
  it('shows ДД.ММ.ГГГГ and accepts typed digits with automatic dots', async () => {
    const user = userEvent.setup();
    render(<DateHost />);
    const input = screen.getByLabelText('Дата');
    expect(input).toHaveValue('01.11.2026');
    await user.clear(input);
    await user.type(input, '15032024');
    expect(input).toHaveValue('15.03.2024');
    expect(screen.getByTestId('v')).toHaveTextContent('2024-03-15');
  });

  it('keeps the last good value while typing, flags impossible dates, restores on blur', async () => {
    const user = userEvent.setup();
    render(<DateHost />);
    const input = screen.getByLabelText('Дата');
    await user.clear(input);
    await user.type(input, '3102');
    expect(screen.getByTestId('v')).toHaveTextContent('2026-11-01');
    await user.type(input, '2026');
    expect(screen.getByText(t.invalid)).toBeVisible();
    expect(screen.getByTestId('v')).toHaveTextContent('2026-11-01');
    await user.tab();
    expect(input).toHaveValue('01.11.2026');
    expect(screen.queryByText(t.invalid)).not.toBeInTheDocument();
  });

  it('refuses dates after the maximum', async () => {
    const user = userEvent.setup();
    render(<DateHost max="2026-11-01" />);
    const input = screen.getByLabelText('Дата');
    await user.clear(input);
    await user.type(input, '02112026');
    expect(screen.getByText(t.future)).toBeVisible();
    expect(screen.getByTestId('v')).toHaveTextContent('2026-11-01');
  });

  it('can be emptied when allowed (birth date in the wizard)', async () => {
    const user = userEvent.setup();
    render(<DateHost start="" allowEmpty />);
    const input = screen.getByLabelText('Дата');
    await user.type(input, '01011996');
    expect(screen.getByTestId('v')).toHaveTextContent('1996-01-01');
    await user.clear(input);
    expect(screen.getByTestId('v')).toHaveTextContent('');
    expect(input).toHaveValue('');
  });

  it('the calendar picks a day, moves by month and year and offers "Сегодня"', async () => {
    const user = userEvent.setup();
    render(<DateHost start="2024-02-10" />);
    await user.click(screen.getByRole('button', { name: `${t.pickDate}: Дата` }));
    expect(await screen.findByText('Февраль 2024')).toBeVisible();
    await user.click(screen.getByRole('button', { name: t.nextMonth }));
    expect(screen.getByText('Март 2024')).toBeVisible();
    await user.click(screen.getByRole('button', { name: t.prevYear }));
    expect(screen.getByText('Март 2023')).toBeVisible();
    await user.click(screen.getByRole('button', { name: t.nextYear }));
    await user.click(screen.getByRole('button', { name: t.prevMonth }));
    await user.click(screen.getByRole('button', { name: '20.02.2024' }));
    await waitFor(() => expect(screen.getByTestId('v')).toHaveTextContent('2024-02-20'));
    expect(screen.getByLabelText('Дата')).toHaveValue('20.02.2024');
    await user.click(screen.getByRole('button', { name: `${t.pickDate}: Дата` }));
    await user.click(await screen.findByRole('button', { name: t.today }));
    await waitFor(() => expect(screen.getByTestId('v')).not.toHaveTextContent('2024-02-20'));
  });

  it('days after the maximum are disabled in the calendar', async () => {
    const user = userEvent.setup();
    render(<DateHost start="2020-01-01" max="2020-01-01" />);
    await user.click(screen.getByRole('button', { name: `${t.pickDate}: Дата` }));
    expect(await screen.findByRole('button', { name: '02.01.2020' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '01.01.2020' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: t.today })).not.toBeInTheDocument();
  });
});

describe('TimeField', () => {
  it('is 24-hour ЧЧ:ММ: typed digits get a colon, impossible times are flagged', async () => {
    const user = userEvent.setup();
    render(<TimeHost />);
    const input = screen.getByLabelText('Время');
    expect(input).toHaveValue('06:00');
    await user.clear(input);
    await user.type(input, '1845');
    expect(input).toHaveValue('18:45');
    expect(screen.getByTestId('v')).toHaveTextContent('18:45');
    await user.clear(input);
    await user.type(input, '2575');
    expect(screen.getByText(t.invalid)).toBeVisible();
    expect(screen.getByTestId('v')).toHaveTextContent('18:45');
    await user.tab();
    expect(input).toHaveValue('18:45');
  });

  it('the picker sets the hour and the minutes', async () => {
    const user = userEvent.setup();
    render(<TimeHost />);
    await user.click(screen.getByRole('button', { name: `${t.pickTime}: Время` }));
    await user.click(await screen.findByRole('button', { name: `${t.hours}: 21` }));
    await user.click(screen.getByRole('button', { name: `${t.minutes}: 35` }));
    expect(screen.getByTestId('v')).toHaveTextContent('21:35');
    expect(screen.getByRole('textbox', { name: 'Время' })).toHaveValue('21:35');
    await user.click(screen.getByRole('button', { name: t.done }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
