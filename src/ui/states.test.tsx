import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './kit';
import { EmptyState, Loading } from './states';

describe('Loading', () => {
  it('рисует заданное число заглушек', () => {
    const { container } = render(<Loading rows={4} />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(container.querySelectorAll('.skeleton')).toHaveLength(4);
  });
  it('по умолчанию три заглушки', () => {
    const { container } = render(<Loading />);
    expect(container.querySelectorAll('.skeleton')).toHaveLength(3);
  });
});

describe('EmptyState', () => {
  it('кнопка-действие вызывает обработчик', () => {
    const onClick = vi.fn();
    render(
      <MemoryRouter>
        <EmptyState kind="photos" text="Пока пусто" action={{ label: 'Добавить', onClick }} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Пока пусто')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    expect(onClick).toHaveBeenCalled();
  });
  it('действие-ссылка ведёт по адресу', () => {
    render(
      <MemoryRouter>
        <EmptyState kind="workouts" text="Нет" action={{ label: 'Создать', to: '/workouts/new' }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Создать' }).getAttribute('href')).toBe(
      '/workouts/new',
    );
  });
  it('работает без действия для всех видов', () => {
    for (const kind of [
      'recipes',
      'templates',
      'foods',
      'diary',
      'reports',
      'achievements',
    ] as const) {
      const { unmount } = render(
        <MemoryRouter>
          <EmptyState kind={kind} text={`t-${kind}`} />
        </MemoryRouter>,
      );
      expect(screen.getByText(`t-${kind}`)).toBeTruthy();
      unmount();
    }
  });
});

describe('Button hint', () => {
  it('показывает подсказку только у неактивной кнопки', () => {
    const { rerender } = render(
      <Button disabled hint="Чего не хватает">
        Ок
      </Button>,
    );
    expect(screen.getByText('Чего не хватает')).toBeTruthy();
    rerender(<Button hint="Чего не хватает">Ок</Button>);
    expect(screen.queryByText('Чего не хватает')).toBeNull();
  });
});
