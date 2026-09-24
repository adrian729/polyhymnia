// The root React component (interface.md "## Root component", architecture.md
// "## React layer").
//
// Nothing here creates, removes or reparents a DOM node outside React's reconciler:
// `layoutScore` is pure, so StrictMode's double invocation produces identical output and
// the component is SSR-safe.

import { useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { CSSProperties, JSX, Ref } from 'react';
import { layoutScore } from '@polyhymnia/notation-engine';
import type {
  ElementBox,
  GlyphRun,
  LayoutResult,
  NotationOptions,
  RectShape,
  TimeMap,
  ViewBox,
} from '@polyhymnia/notation-engine';
import type { NoteId, ScoreDoc } from '@polyhymnia/notation-model';

/**
 * The imperative handle (interface.md "## Imperative handle").
 *
 * Only the three methods backed by code that exists return a value. `hitTest`,
 * `setPlaybackTick`, `animateCursor` and `focus` need the engine's `query/hitTest.ts` and the
 * playback cursor, neither of which is written yet, so they are typed `never` and throw:
 * a caller finds out at compile time, and at the latest loudly at runtime, rather than
 * against a silent no-op that looks like a layout bug.
 */
export interface NotationHandle {
  getLayout(): LayoutResult;
  getTimeMap(): TimeMap;
  /** Serializes the mounted `<svg>`, standalone (xmlns added), for export or snapshots. */
  exportSVG(): string;
  /** @throws always — no engine `hitTest` yet (roadmap.md Phase 3+). */
  hitTest(point: { x: number; y: number }): never;
  /** @throws always — no playback cursor yet (roadmap.md Phase 3+). */
  setPlaybackTick(tick: number): never;
  /** @throws always — no cursor animation yet (roadmap.md Phase 3+). */
  animateCursor(span: unknown): never;
  /** @throws always — needs the per-element focus targets interaction.md adds. */
  focus(id: NoteId): never;
}

export interface NotationProps {
  score: ScoreDoc;
  options?: NotationOptions;
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
  className,
  style,
  onLayout,
  ref,
}: NotationProps): JSX.Element {
  const layout = useMemo(() => layoutScore(score, options), [score, options]);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    onLayout?.(layout);
  }, [layout, onLayout]);

  useImperativeHandle(
    ref,
    (): NotationHandle => ({
      getLayout: () => layout,
      getTimeMap: () => layout.timemap,
      exportSVG: () => serialize(svgRef.current),
      hitTest: () => notYet('hitTest'),
      setPlaybackTick: () => notYet('setPlaybackTick'),
      animateCursor: () => notYet('animateCursor'),
      focus: () => notYet('focus'),
    }),
    [layout],
  );

  return (
    <svg
      ref={svgRef}
      className={classNames('pn-notation', className)}
      style={style}
      viewBox={viewBoxAttr(layout.viewBox)}
      role="img"
      aria-label={describeScore(layout)}
    >
      <g data-pn="rules">
        {layout.rects.map((r, i) => (
          <Rect key={`r${i}`} shape={r} />
        ))}
      </g>
      {/* Ties and slurs are pipeline stage 10; `paths` is always empty today. The layer
          exists so their arrival is a map over data, not a change of DOM shape. */}
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
            // One `<g role="img">` per element, labelled from `ElementBox.label`
            // (interaction.md "## Accessibility"). No tabIndex/role="button": those
            // belong to insert/select mode, which does not exist yet.
            <g
              key={`g${i}`}
              role="img"
              aria-label={layout.elements[group.el]?.label ?? group.el}
              data-pn="element"
              data-pn-el={group.el}
            >
              {group.glyphs.map((g, j) => (
                <Glyph key={`g${i}-${j}`} glyph={g} />
              ))}
            </g>
          ),
        )}
      </g>
    </svg>
  );
}

function Rect({ shape }: { shape: RectShape }): JSX.Element {
  return (
    <rect
      x={shape.x}
      y={shape.y}
      width={shape.w}
      height={shape.h}
      // A beam is a rotated rect (architecture.md); it rotates about its own top-left
      // corner, which is the endpoint the layout engine positions.
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
  el: NoteId | undefined;
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
