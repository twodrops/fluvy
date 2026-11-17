import {
  isActive,
  isUsable,
  localize,
  textName,
  TOGGLE_DOMAINS,
  toggleEntity,
  type EntityName,
  type EntityView,
  type FluvyCardConfig,
  type HomeAssistant,
  type LovelaceGridOptions,
} from '@fluvy/core';
import { head, sheetStyles, type IconRef, type Tone } from '@fluvy/ui';
import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';
import { Card, type CardEditor } from '../shared/base.js';
import { ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import { counted } from '../shared/counted.js';
import { toneOf } from '../shared/colour.js';
import { currentTone, iconOf, toneFor } from '../shared/domain.js';
import { EMPTY, entryCount, HEAD, rowsOf } from '../shared/heights.js';
import { emptyPanel, hideEmpty, itemsOf, listOf, type EmptyList } from '../shared/lists.js';
import { levelRound, ROUND, ROUND_GAP } from '../shared/round.js';

/** The domains a round is safe to flip by a tap (never a lock, a vacuum, a player or a one-shot button or scene). */
const NO_TAP_TOGGLE: ReadonlySet<string> = new Set([
  'scene',
  'script',
  'button',
  'input_button',
  'lock',
  'vacuum',
  'media_player',
]);

/** One round of the card: its own name, icon and colour beside the entity's. */
export interface RoundItem {
  entity: string;
  name?: EntityName;
  icon?: string;
  /** The round's own colour when it is on (a Home Assistant colour name or `#rrggbb`), over its kind's tone. */
  color?: string;
}

export interface RoundsCardConfig extends FluvyCardConfig, EmptyList {
  /** The head's title; none: the rounds alone, no head at all. */
  title?: string;
  /** The rounds, in the order they are drawn. */
  items?: readonly (string | RoundItem)[];
  /** "3 of 12 on" in the head's second line (default). */
  show_count?: boolean;
}

/** A round as the card reads it. */
interface Round {
  readonly item: RoundItem;
  readonly view: EntityView;
  readonly name: string;
  readonly glyph: IconRef | string;
  readonly usable: boolean;
  readonly on: boolean;
  readonly tone: Tone;
  readonly accent: string | undefined;
  /** A tap turns it on and off; else it opens its details, as a hold always does. */
  readonly canToggle: boolean;
}

/**
 * The card's height at a 360 column: its head where it has a title, then its rounds — six a line at most, as many
 * lines as they take — or the empty panel with no rounds yet.
 */
export function roundsHeight(config: RoundsCardConfig): number {
  const n = entryCount(config, ['items', 'entities']);
  if (!n) return (config.title ? HEAD : 40) + EMPTY;
  const top = config.title ? 20 + 44 + 16 : 20;
  return top + rowsOf(n, 6) * (ROUND + ROUND_GAP) - ROUND_GAP + 20;
}

/**
 * Any entities as rounds (1.23, mushroom chips' kin): one or more, of any domain, each a round — lit in its kind's
 * tone, a ring all the way round while it is on. A tap turns it on and off where that is safe (never a lock, a
 * vacuum, a player, a scene, a script or a button), else opens its details, as a hold always does.
 */
export class FluvyRoundsCard extends Card<RoundsCardConfig> {
  static override layoutHeight(config: RoundsCardConfig): number {
    return roundsHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    sheetStyles.rooms,
    css`
      .rd-card {
        width: auto;
      }
    `,
  ];

  static override editor(): Promise<CardEditor> {
    return import('./rounds-editor.js');
  }
  static override aliases: AliasSpec = {
    keys: [{ from: 'entities', to: 'items' }],
    items: { items: ITEM_ALIASES },
  };

  static getStubConfig(
    hass: HomeAssistant | undefined,
    entities: readonly string[],
  ): RoundsCardConfig {
    return {
      type: 'custom:fluvy-rounds-card',
      title: localize(hass, 'cards.rounds'),
      items: entities.slice(0, 6),
    };
  }

  protected override prepare(config: RoundsCardConfig): RoundsCardConfig {
    listOf(config, 'items');
    return config;
  }

  private items(): RoundItem[] {
    return itemsOf<RoundItem>(this.config?.items);
  }

  protected override watched(): readonly string[] {
    return this.items().map((item) => item.entity);
  }

  override getCardSize(): number {
    return 1 + rowsOf(this.items().length, 6);
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /** Whether a tap on a round is safe to flip: a usable entity of a domain Home Assistant's own toggle reaches. */
  private canToggle(view: EntityView): boolean {
    return isUsable(view) && TOGGLE_DOMAINS.has(view.domain) && !NO_TAP_TOGGLE.has(view.domain);
  }

  /** Each round as it is drawn: its state, as the finger left it until Home Assistant agrees. */
  private rounds(): Round[] {
    return this.items().map((item) => {
      const view = this.entity(item.entity);
      const usable = isUsable(view);
      const state = this.stateOf(view);
      const on =
        state === view.state ? isActive(view) : !['off', 'closed', 'locked'].includes(state);
      const tone = currentTone(view, toneFor(view));
      return {
        item,
        view,
        name: this.nameFor(view, item.name),
        glyph: iconOf(view, item.icon),
        usable,
        on,
        tone,
        accent: item.color && on ? this.accents.item(item.color) : undefined,
        canToggle: this.canToggle(view),
      };
    });
  }

  /** The round's own on and off, each member by what it takes (a cover and a valve by their open word). */
  private flip(round: Round): void {
    if (!this.hass) return;
    const next = !round.on;
    const openWord = round.view.domain === 'cover' || round.view.domain === 'valve';
    this.expect(round.view.id, next ? (openWord ? 'open' : 'on') : openWord ? 'closed' : 'off');
    void toggleEntity(this.hass, round.view.id);
  }

  private open(round: Round): void {
    this.tap(round.view.id, { action: 'more-info' });
  }

  /** One round: lit, its colour and a ring all the way round; a tap its switch where safe, else its details. */
  private renderRound(round: Round, place?: string): TemplateResult {
    return levelRound({
      name: round.name,
      glyph: round.glyph,
      usable: round.usable,
      on: round.on,
      level: 100,
      tone: round.tone,
      accent: round.accent,
      switches: round.canToggle,
      onTap: round.canToggle ? () => this.flip(round) : () => this.open(round),
      onHold: () => this.open(round),
      place,
    });
  }

  /**
   * The rounds on their own lines: as many a line as the column holds (six at most), the lines balanced, each round
   * on a whole pixel of one set of columns — the first under the head's icon, the last on the content's edge.
   */
  private renderLine(rounds: readonly Round[], w: number): TemplateResult {
    const fits = Math.max(1, Math.min(6, Math.floor((w + ROUND_GAP) / (ROUND + ROUND_GAP))));
    const lines = Math.ceil(rounds.length / fits);
    const columns = Math.ceil(rounds.length / lines);
    const x = (i: number): number =>
      columns === 1 ? 0 : Math.round((i * (w - ROUND)) / (columns - 1));
    return html`<div
      class="lt-bulbs lt-bulbs--line"
      style="height:${lines * (ROUND + ROUND_GAP) - ROUND_GAP}px"
    >
      ${rounds.map((round, i) =>
        this.renderRound(
          round,
          `left:${x(i % columns)}px;top:${Math.floor(i / columns) * (ROUND + ROUND_GAP)}px`,
        ),
      )}
    </div>`;
  }

  protected override renderCard(): TemplateResult {
    const rounds = this.rounds();
    const w = this.contentWidth;
    const title = textName(this.config?.title);
    hideEmpty(this, !rounds.length);
    if (!rounds.length)
      return html`<article class="fv-card rd-card" data-card>
        ${
          title
            ? head({
                icon: this.config?.icon ?? 'grid',
                tone: toneOf(this.config, 'accent'),
                title,
                name: true,
                ...this.headActions(),
              })
            : nothing
        }
        ${emptyPanel(this, true, 'grid', 'common.no_entities')}
      </article>`;
    const sub =
      this.config?.show_count !== false
        ? counted(
            this.hass,
            rounds.map((round) => round.view.id),
            (id) => this.entity(id),
          )
        : '';
    return html`<article class="fv-card rd-card lt-card lt-card--row" data-card>
      ${
        title
          ? head({
              icon: this.config?.icon ?? 'grid',
              tone: toneOf(this.config, 'accent'),
              title,
              name: true,
              sub,
              ...this.headActions(),
            })
          : nothing
      }
      ${this.renderLine(rounds, w)}
    </article>`;
  }
}
