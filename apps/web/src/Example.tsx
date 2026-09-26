import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import type { Diagnostic, LayoutResult } from '@polyhymnia/notation-react';

interface ExampleProps {
  title: string;
  caption?: string;
  extra?: readonly Diagnostic[];
  children: (onLayout: (layout: LayoutResult) => void) => ReactNode;
}

export function Example({ title, caption, extra = [], children }: ExampleProps) {
  const [diagnostics, setDiagnostics] = useState<readonly Diagnostic[]>([]);
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
