// One labelled gallery entry: a caption, the rendered notation, and whatever the layout
// engine complained about while producing it.

import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import type { Diagnostic, LayoutResult } from '@polyhymnia/notation-react';

interface ExampleProps {
  title: string;
  caption?: string;
  /** Diagnostics from outside layout (there are none today — every diagnostic this
   *  gallery shows comes from `layoutScore` itself, via `onLayout` below). */
  extra?: readonly Diagnostic[];
  children: (onLayout: (layout: LayoutResult) => void) => ReactNode;
}

export function Example({ title, caption, extra = [], children }: ExampleProps) {
  const [diagnostics, setDiagnostics] = useState<readonly Diagnostic[]>([]);
  // Stable identity: `<Notation>` fires `onLayout` from an effect keyed on it, and the
  // same layout hands back the same `diagnostics` array, so this settles after one pass.
  // Compared by content, not identity: a fresh-but-equal array on every layout would
  // otherwise re-render forever for any example whose score is rebuilt per render.
  const onLayout = useCallback(
    (layout: LayoutResult) =>
      setDiagnostics((prev) => (same(prev, layout.diagnostics) ? prev : layout.diagnostics)),
    [],
  );

  const all = [...extra, ...diagnostics];
  return (
    <section className="example">
      <h3>{title}</h3>
      {caption && <p className="caption">{caption}</p>}
      {children(onLayout)}
      {all.length > 0 && (
        <ul className="diagnostics">
          {all.map((d, i) => (
            <li key={i}>
              {d.severity}: [{d.code}] {d.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function same(a: readonly Diagnostic[], b: readonly Diagnostic[]): boolean {
  return (
    a === b ||
    (a.length === b.length && a.every((d, i) => d.code === b[i]!.code && d.message === b[i]!.message))
  );
}
