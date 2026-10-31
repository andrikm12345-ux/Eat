import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ru } from '../i18n/ru';
import { stubState } from '../test/pwaRegisterStub';
import { UpdateBanner } from './UpdateBanner';

afterEach(() => {
  stubState.needRefresh = false;
  stubState.offlineReady = false;
  stubState.updateCalls = 0;
});

describe('UpdateBanner', () => {
  it('renders nothing when there is no update', () => {
    const { container } = render(<UpdateBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers to update and triggers the service worker', async () => {
    stubState.needRefresh = true;
    const user = userEvent.setup();
    render(<UpdateBanner />);
    expect(screen.getByText(ru.pwa.updateAvailable)).toBeVisible();
    await user.click(screen.getByRole('button', { name: ru.pwa.updateAction }));
    expect(stubState.updateCalls).toBe(1);
  });

  it('can be postponed', async () => {
    stubState.needRefresh = true;
    const user = userEvent.setup();
    render(<UpdateBanner />);
    await user.click(screen.getByRole('button', { name: ru.pwa.later }));
    expect(screen.queryByText(ru.pwa.updateAvailable)).not.toBeInTheDocument();
  });

  it('announces offline readiness once', async () => {
    stubState.offlineReady = true;
    const user = userEvent.setup();
    render(<UpdateBanner />);
    expect(screen.getByText(ru.pwa.offlineReady)).toBeVisible();
    await user.click(screen.getByRole('button', { name: ru.pwa.ok }));
    expect(screen.queryByText(ru.pwa.offlineReady)).not.toBeInTheDocument();
  });

  it('offers a reload when a new service worker takes control', async () => {
    const target = new EventTarget();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: Object.assign(target, { controller: {} }),
    });
    const user = userEvent.setup();
    render(<UpdateBanner />);
    expect(screen.queryByText(ru.pwa.updateAvailable)).not.toBeInTheDocument();
    act(() => {
      target.dispatchEvent(new Event('controllerchange'));
    });
    expect(screen.getByText(ru.pwa.updateAvailable)).toBeVisible();
    await user.click(screen.getByRole('button', { name: ru.pwa.later }));
    expect(screen.queryByText(ru.pwa.updateAvailable)).not.toBeInTheDocument();
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('stays silent on the first install (no previous controller)', () => {
    const target = new EventTarget();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: Object.assign(target, { controller: null }),
    });
    render(<UpdateBanner />);
    act(() => {
      target.dispatchEvent(new Event('controllerchange'));
    });
    expect(screen.queryByText(ru.pwa.updateAvailable)).not.toBeInTheDocument();
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });
});
