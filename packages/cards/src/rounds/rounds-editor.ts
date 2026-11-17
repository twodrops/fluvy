import type { LovelaceConfigForm } from '@fluvy/core';
import { ACTIONS_BASE, ICON_ACTIONS_BASE, type BaseKey } from '../shared/base.js';
import { configKeys } from '../shared/config.js';
import {
  accentField,
  actionFields,
  boolField,
  colourFields,
  emptyFields,
  entityField,
  fieldRow,
  formLabels,
  headFields,
  holdsDevice,
  iconField,
  nameIconFields,
  namesField,
  onlyWhen,
  textField,
} from '../shared/form.js';
import { EMPTY_KEYS } from '../shared/lists.js';
import type { EditorDefaults, RowsListSpec } from '../shared/rows-editor.js';
import type { RoundsCardConfig } from './rounds-card.js';

/** The rounds card's editor: fetched by its `editor()` the first time the card is edited, never by a dashboard. */

/** A card of rounds has no entity of its own: its icon, tone and colours are the head's and the rounds' default. */
export const base: readonly BaseKey[] = [
  'names',
  'icon',
  'tone',
  'color',
  'card_color',
  'card_opacity',
  'card_border',
  'unavailable',
  ...ACTIONS_BASE,
  'show_icon',
  'name_lines',
  ...ICON_ACTIONS_BASE,
];

export const keys = configKeys<RoundsCardConfig>()(['title', 'items', 'show_count', ...EMPTY_KEYS]);

export const lists: readonly RowsListSpec[] = [
  {
    key: 'items',
    title: 'editor.entities',
    fields: ['names'],
    keys: ['entity', 'name', 'icon', 'color'],
    schema: [entityField(), nameIconFields(), accentField('color', { item: 'own' })],
  },
];

export const defaults: EditorDefaults = () => ({ show_count: true });

export function getConfigForm(): LovelaceConfigForm {
  return {
    schema: [
      fieldRow(textField('title'), iconField()),
      headFields(),
      onlyWhen(holdsDevice('items', 'entities'), namesField()),
      boolField('show_count'),
      ...colourFields(),
      emptyFields(),
      actionFields({ icon: true, many: true }),
    ],
    ...formLabels(),
  };
}
