import type { HitKind, HitOptions, HitResult, LayoutResult, NotationOptions } from '@polyhymnia/notation-engine';

export type NotationIntent =
  | { type: 'activate'; target: HitResult }
  | { type: 'hover'; target: HitResult | null };

export interface IntentContext {
  layout: LayoutResult;
  nativeEvent: MouseEvent | KeyboardEvent;
}

export interface NotationInteractionProps {
  targets: readonly HitKind[];
  voice?: 0 | 1;
  onIntent?: (intent: NotationIntent, ctx: IntentContext) => void;
}

export function InteractionChild(_props: NotationInteractionProps): null {
  return null;
}

export function hitIdentity(hit: HitResult): string {
  if (hit.kind === 'element') return `element:${hit.id}`;
  if (hit.kind === 'slot') return `slot:${hit.slot.eventId}`;
  return `point:${hit.measureIndex}:${hit.staffPosition}`;
}

export function clientToLayoutPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const ctm = svg.getScreenCTM?.();
  if (!ctm) return null;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const local = point.matrixTransform(ctm.inverse());
  return { x: local.x, y: local.y };
}

export function resolveHitOptions(props: NotationInteractionProps, options?: NotationOptions): HitOptions {
  return { kinds: props.targets, voice: props.voice, insertAlteration: options?.accidentals?.insertAlteration };
}
