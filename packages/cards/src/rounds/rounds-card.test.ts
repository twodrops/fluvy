// @vitest-environment happy-dom
import type { HomeAssistant, LovelaceCardConfig } from '@fluvy/core';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { familiesDefined } from '../index.js';
import { roundsHeight } from './rounds-card.js';

// the index fetches the lazy families: they land before this file's page goes, and registers the custom element
afterAll(() => familiesDefined);

const STAMP = '2026-11-17T19:00:00+00:00';
const state = (id: string, value: string, attributes: Record<string, unknown> = {}) => ({
  entity_id: id,
  state: value,
  attributes,
  last_changed: STAMP,
  last_updated: STAMP,
});
const STATES = {
  'switch.kitchen_light': state('switch.kitchen_light', 'on', { friendly_name: 'Kitchen light' }),
  'switch.washer': state('switch.washer', 'off', { friendly_name: 'Washer' }),
  'binary_sensor.kitchen_window': state('binary_sensor.kitchen_window', 'on', {
    friendly_name: 'Kitchen window',
    device_class: 'window',
  }),
  'lock.front_door': state('lock.front_door', 'locked', { friendly_name: 'Front door' }),
};

afterEach(() => document.body.replaceChildren());

const house = (callService: HomeAssistant['callService']): HomeAssistant =>
  ({
    language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    states: STATES,
    entities: {},
    devices: {},
    areas: {},
    user: { id: 'u', is_admin: true },
    localize: (key: string) => key,
    formatEntityState: (s: { state: string }) => s.state,
    hassUrl: (path: string) => path,
    callService,
  }) as unknown as HomeAssistant;

type CardElement = HTMLElement & {
  setConfig(config: LovelaceCardConfig): void;
  hass: HomeAssistant;
  updateComplete: Promise<boolean>;
};

async function mount(
  config: Record<string, unknown>,
  callService: HomeAssistant['callService'] = () => Promise.resolve(),
): Promise<{ root: ShadowRoot; card: CardElement }> {
  const card = document.createElement('fluvy-rounds-card') as CardElement;
  card.setConfig({
    type: 'custom:fluvy-rounds-card',
    items: Object.keys(STATES),
    ...config,
  });
  card.hass = house(callService);
  document.body.append(card);
  await card.updateComplete;
  return { root: card.shadowRoot!, card };
}

describe('the rounds card: any entities as rounds (1.23)', () => {
  it('draws one round a given entity, lit where it is active', async () => {
    const { root } = await mount({});
    const rounds = [...root.querySelectorAll<HTMLElement>('.lt-bulb')];
    expect(rounds).toHaveLength(4);
    expect(rounds.map((r) => r.classList.contains('is-on'))).toEqual([true, false, true, false]);
  });

  it('says "X of Y on" in its head, when it has a title', async () => {
    const { root } = await mount({ title: 'Quick picks' });
    expect(root.querySelector('.fv-card__sub')?.textContent).toBe('2 of 4 on');
  });

  it('draws no head at all without a title', async () => {
    const { root } = await mount({});
    expect(root.querySelector('.fv-card__head')).toBeNull();
  });

  it('a tap flips a switch (on and off, by its own service)', async () => {
    const callService = vi.fn(() => Promise.resolve());
    const { root } = await mount({}, callService);
    const washer = [...root.querySelectorAll<HTMLElement>('.lt-bulb')][1]!;
    washer.click();
    expect(callService).toHaveBeenCalledWith(
      'switch',
      'turn_on',
      {},
      { entity_id: 'switch.washer' },
    );
  });

  it('a tap on an entity no service reaches opens its details instead (a window sensor, a lock)', async () => {
    const { root, card } = await mount({});
    const info = vi.fn();
    card.addEventListener('hass-more-info', info);
    const window_ = [...root.querySelectorAll<HTMLElement>('.lt-bulb')][2]!;
    window_.click();
    expect(info).toHaveBeenCalledTimes(1);
  });

  it('its height counts a line of six rounds at most, else the empty panel with none yet', () => {
    expect(roundsHeight({ type: 'custom:fluvy-rounds-card' })).toBeGreaterThan(0);
    expect(
      roundsHeight({
        type: 'custom:fluvy-rounds-card',
        title: 'Quick picks',
        items: Array(7).fill('switch.a'),
      }),
    ).toBeGreaterThan(
      roundsHeight({ type: 'custom:fluvy-rounds-card', title: 'Quick picks', items: ['switch.a'] }),
    );
  });
});
