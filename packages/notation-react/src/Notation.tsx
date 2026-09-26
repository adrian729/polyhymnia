// The root React component (interface.md "## Root component", architecture.md
// "## React layer").
//
// Nothing here creates, removes or reparents a DOM node outside React's reconciler:
// `layoutScore` is pure, so StrictMode's double invocation produces identical output and
// the component is SSR-safe.

import { Children, isValidElement, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type {
  CSSProperties,
  JSX,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  Ref,
} from 'react';
import { HIT_STAFF_MARGIN, hitTest, layoutScore, previewShapes } from '@polyhymnia/notation-engine';
import type {
  ElementBox,
  GlyphRun,
  HitResult,
  LayoutResult,
  NotationOptions,
  RectShape,
  TimeMap,
  ViewBox,
} from '@polyhymnia/notation-engine';
import type { MnxDocument, NoteId } from '@polyhymnia/notation-model';
import { InteractionChild, clientToLayoutPoint, hitIdentity, resolveHitOptions } from './Interaction.js';
import type { NotationInteractionProps, NotationIntent } from './Interaction.js';
import { MarksChild } from './Marks.js';
import type { NotationMarksProps } from './Marks.js';

export type PlaybackView =
  | { mode: 'off' }
  | { mode: 'notes'; activeIds: readonly string[] }
  | {
      mode: 'cursor';
      position: { tick: number } | { seconds: number };
      follow?: 'none' | 'scroll';
      highlightActive?: boolean;
    }
  | { mode: 'manual' };

export interface NotationPlaybackProps {
  view: PlaybackView;
}

function PlaybackChild(_props: NotationPlaybackProps): null {
  return null;
}

export interface NotationHandle {
  getLayout(): LayoutResult;
  getTimeMap(): TimeMap;
  /** Serializes the mounted `<svg>`, standalone (xmlns added), for export or snapshots. */
  exportSVG(): string;
  hitTest(point: { x: number; y: number }, opts?: Parameters<typeof hitTest>[2]): HitResult | null;
  setPlaybackTick(tick: number): void;
  animateCursor(span: unknown): never;
  focus(id: NoteId): void;
}

export interface NotationProps {
  score: MnxDocument;
  options?: NotationOptions;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Declarative alternative to `handle.getLayout()`; fires whenever layout changes. */
  onLayout?: (layout: LayoutResult) => void;
  ref?: Ref<NotationHandle>;
}

// SMuFL: 1 em = 4 sp, so this is the one font-size that makes glyphs correct in an
// sp-unit viewBox (architecture.md "## Coordinate system"). Not a magic constant.
const GLYPH_FONT_SIZE = 4;

export function Notation({
  score,
  options,
  children,
  className,
  style,
  onLayout,
  ref,
}: NotationProps): JSX.Element {
  const layout = useMemo(() => layoutScore(score, options), [score, options]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const elementRefs = useRef(new Map<string, SVGGElement>());
  const lastHoverRef = useRef<string | null>(null);
  const playbackView = extractPlaybackView(children);
  const interaction = extractInteraction(children);
  const marks = extractMarks(children);
  const targets = interaction?.targets ?? EMPTY_TARGETS;

  useEffect(() => {
    onLayout?.(layout);
  }, [layout, onLayout]);

  useEffect(() => {
    if (playbackView?.mode === 'notes') setPlaying(elementRefs.current, new Set(playbackView.activeIds));
    else if (playbackView === undefined || playbackView.mode === 'off') setPlaying(elementRefs.current, EMPTY_IDS);
  }, [playbackView, layout]);

  useEffect(() => {
    setStates(elementRefs.current, marks?.states);
    setSelection(elementRefs.current, marks?.selection);
  }, [marks?.states, marks?.selection, layout]);

  useEffect(() => {
    if (lastHoverRef.current === null) return;
    lastHoverRef.current = null;
    interaction?.onIntent?.({ type: 'hover', target: null }, { layout, nativeEvent: new MouseEvent('pointerleave') });
  }, [layout]);

  useImperativeHandle(
    ref,
    (): NotationHandle => ({
      getLayout: () => layout,
      getTimeMap: () => layout.timemap,
      exportSVG: () => serialize(svgRef.current),
      hitTest: (point, opts) => hitTest(layout, point, opts),
      setPlaybackTick: (tick) => setPlaying(elementRefs.current, new Set(layout.timemap.activeAt(tick))),
      animateCursor: () => notYet('animateCursor'),
      focus: (id) => elementRefs.current.get(id)?.focus(),
    }),
    [layout],
  );

  const handleClick = (event: ReactMouseEvent<SVGSVGElement>): void => {
    if (!interaction?.onIntent || targets.length === 0 || !svgRef.current) return;
    const point = clientToLayoutPoint(svgRef.current, event.clientX, event.clientY);
    if (!point) return;
    const hit = hitTest(layout, point, resolveHitOptions(interaction, options));
    if (hit) {
      interaction.onIntent({ type: 'activate', target: hit }, { layout, nativeEvent: event.nativeEvent });
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (!interaction?.onIntent || targets.length === 0 || !svgRef.current) return;
    const point = clientToLayoutPoint(svgRef.current, event.clientX, event.clientY);
    const hit = point ? hitTest(layout, point, resolveHitOptions(interaction, options)) : null;
    const identity = hit ? hitIdentity(hit) : null;
    if (identity === lastHoverRef.current) return;
    lastHoverRef.current = identity;
    interaction.onIntent({ type: 'hover', target: hit }, { layout, nativeEvent: event.nativeEvent });
  };

  const handlePointerLeave = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (!interaction?.onIntent || lastHoverRef.current === null) return;
    lastHoverRef.current = null;
    interaction.onIntent({ type: 'hover', target: null }, { layout, nativeEvent: event.nativeEvent });
  };

  const isElementKeyboardTarget = (id: string): boolean =>
    targets.includes('element') && (interaction?.voice === undefined || layout.elements[id]?.voice === interaction.voice);

  const handleElementKeyDown = (id: NoteId) => (event: ReactKeyboardEvent<SVGGElement>): void => {
    if (!interaction?.onIntent || !isElementKeyboardTarget(id)) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const box = layout.elements[id];
    if (!box) return;
    event.preventDefault();
    const center = { x: box.hitBox.x + box.hitBox.w / 2, y: box.hitBox.y + box.hitBox.h / 2 };
    const hit = hitTest(layout, center, { ...resolveHitOptions(interaction, options), kinds: ['element'] });
    if (hit) interaction.onIntent({ type: 'activate', target: hit }, { layout, nativeEvent: event.nativeEvent });
  };

  return (
    <svg
      ref={svgRef}
      className={classNames('pn-notation', className)}
      style={style}
      viewBox={viewBoxAttr(layout.viewBox)}
      role="img"
      aria-label={describeScore(layout)}
      data-pn-interactive={targets.length > 0 ? '' : undefined}
      onClick={handleClick}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <g data-pn="rules">
        {layout.rects.map((r, i) => (
          <Rect key={`r${i}`} shape={r} />
        ))}
      </g>
      {targets.length > 0 && (
        <g data-pn="hit-overlays">
          {layout.systems.map((s) => (
            <rect
              key={`hit-${s.index}`}
              data-pn="hit-overlay"
              x={s.x}
              y={s.y - HIT_STAFF_MARGIN}
              width={s.w}
              height={s.h + HIT_STAFF_MARGIN * 2}
              fill="transparent"
              pointerEvents="all"
            />
          ))}
        </g>
      )}
      {/* Beams (stage 9) render here now; ties and slurs are stage 10 and still empty.
          One layer for every `PathShape`, so their arrival is a map over data, not a
          change of DOM shape. */}
      <g data-pn="curves">
        {layout.paths.map((p, i) => (
          <path
            key={`p${i}`}
            d={p.d}
            data-pn={p.cls}
            data-pn-el={p.el}
            fill="currentColor"
            stroke="none"
          />
        ))}
      </g>
      <g data-pn="glyphs" fontSize={GLYPH_FONT_SIZE}>
        {groupGlyphs(layout.glyphs).map((group, i) =>
          group.el === undefined ? (
            group.glyphs.map((g, j) => <Glyph key={`g${i}-${j}`} glyph={g} />)
          ) : (
            <g
              key={`g${i}`}
              ref={elementRef(elementRefs.current, group.el)}
              role={isElementKeyboardTarget(group.el) ? 'button' : 'img'}
              tabIndex={isElementKeyboardTarget(group.el) ? 0 : undefined}
              aria-label={layout.elements[group.el]?.label ?? group.el}
              data-pn="element"
              data-pn-el={group.el}
              onKeyDown={isElementKeyboardTarget(group.el) ? handleElementKeyDown(group.el) : undefined}
            >
              {group.glyphs.map((g, j) => (
                <Glyph key={`g${i}-${j}`} glyph={g} />
              ))}
            </g>
          ),
        )}
      </g>
      {marks?.preview != null && <PreviewGroup layout={layout} preview={marks.preview} />}
      {children}
    </svg>
  );
}

export namespace Notation {
  export const Playback = PlaybackChild;
  export const Interaction = InteractionChild;
  export const Marks = MarksChild;
}

function PreviewGroup({ layout, preview }: { layout: LayoutResult; preview: NonNullable<NotationMarksProps['preview']> }): JSX.Element {
  const { glyphs, rects } = previewShapes(layout, preview);
  return (
    <g data-pn="preview" fontSize={GLYPH_FONT_SIZE}>
      {rects.map((r, i) => (
        <Rect key={`pr${i}`} shape={r} />
      ))}
      {glyphs.map((g, i) => (
        <Glyph key={`pg${i}`} glyph={g} />
      ))}
    </g>
  );
}

function Rect({ shape }: { shape: RectShape }): JSX.Element {
  return (
    <rect
      x={shape.x}
      y={shape.y}
      width={shape.w}
      height={shape.h}
      transform={
        shape.rot ? `rotate(${shape.rot} ${shape.x} ${shape.y})` : undefined
      }
      data-pn={shape.cls}
      data-pn-el={shape.el}
      fill="currentColor"
      stroke="none"
    />
  );
}

function Glyph({ glyph }: { glyph: GlyphRun }): JSX.Element {
  return (
    <text
      x={glyph.x}
      y={glyph.y}
      data-pn={glyph.cls}
      data-pn-el={glyph.el}
      fill="currentColor"
      stroke="none"
    >
      {String.fromCodePoint(glyph.cp)}
    </text>
  );
}

// --- helpers ----------------------------------------------------------------

interface GlyphGroup {
  el: string | undefined;
  glyphs: GlyphRun[];
}

/** Runs of consecutive glyphs belonging to one element — emit pushes a notehead with its
 *  accidental, dots and flag together, so a run is the whole element. */
function groupGlyphs(glyphs: readonly GlyphRun[]): GlyphGroup[] {
  const groups: GlyphGroup[] = [];
  for (const g of glyphs) {
    const last = groups[groups.length - 1];
    if (last && last.el === g.el) last.glyphs.push(g);
    else groups.push({ el: g.el, glyphs: [g] });
  }
  return groups;
}

export function viewBoxAttr(vb: ViewBox): string {
  return `${vb.x} ${vb.y} ${vb.w} ${vb.h}`;
}

/** The `<svg>` root's summary label (interaction.md "## Accessibility"). Per-element
 *  detail lives on the element `<g>`s, so this stays a one-line overview. */
export function describeScore(layout: LayoutResult): string {
  const boxes: ElementBox[] = Object.values(layout.elements);
  const notes = boxes.filter((b) => b.kind !== 'rest').length;
  const rests = boxes.length - notes;
  const measures = layout.timemap.measures.length;
  return `Music notation: ${count(measures, 'measure')}, ${count(notes, 'note')}, ${count(rests, 'rest')}`;
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function classNames(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

const EMPTY_IDS: ReadonlySet<string> = new Set();
const EMPTY_TARGETS: readonly [] = [];

function extractPlaybackView(children: ReactNode): PlaybackView | undefined {
  let view: PlaybackView | undefined;
  Children.forEach(children, (child) => {
    if (isValidElement<NotationPlaybackProps>(child) && child.type === PlaybackChild) view = child.props.view;
  });
  return view;
}

function extractInteraction(children: ReactNode): NotationInteractionProps | undefined {
  let props: NotationInteractionProps | undefined;
  Children.forEach(children, (child) => {
    if (isValidElement<NotationInteractionProps>(child) && child.type === InteractionChild) props = child.props;
  });
  return props;
}

function extractMarks(children: ReactNode): NotationMarksProps | undefined {
  let props: NotationMarksProps | undefined;
  Children.forEach(children, (child) => {
    if (isValidElement<NotationMarksProps>(child) && child.type === MarksChild) props = child.props;
  });
  return props;
}

function setStates(refs: Map<string, SVGGElement>, states: NotationMarksProps['states'] | undefined): void {
  for (const [id, el] of refs) {
    const value = states?.[id];
    if (value !== undefined) el.setAttribute('data-pn-state', value);
    else el.removeAttribute('data-pn-state');
  }
}

function setSelection(refs: Map<string, SVGGElement>, selection: NotationMarksProps['selection'] | undefined): void {
  const set = selection ? new Set(selection) : EMPTY_IDS;
  for (const [id, el] of refs) {
    if (set.has(id)) el.setAttribute('data-pn-selected', 'true');
    else el.removeAttribute('data-pn-selected');
  }
}

function elementRef(refs: Map<string, SVGGElement>, id: string) {
  return (el: SVGGElement | null): void => {
    if (el) refs.set(id, el);
    else refs.delete(id);
  };
}

function setPlaying(refs: Map<string, SVGGElement>, ids: ReadonlySet<string>): void {
  for (const [id, el] of refs) {
    if (ids.has(id)) el.setAttribute('data-pn-playing', 'true');
    else el.removeAttribute('data-pn-playing');
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function serialize(svg: SVGSVGElement | null): string {
  if (!svg) throw new Error('exportSVG(): the component is not mounted.');
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', SVG_NS);
  return new XMLSerializer().serializeToString(clone);
}

function notYet(method: string): never {
  throw new Error(
    `NotationHandle.${method}() is not implemented yet — see roadmap.md Phase 3+`,
  );
}
