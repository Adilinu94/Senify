import {
  alignStyle,
  cardStyle,
  contentWidthClass,
  cx,
  headingStyle,
  SectionShell,
  str,
  type SectionProps,
} from "./shared.tsx";

export function Comparison({ node }: SectionProps): React.JSX.Element {
  const columns = (Array.isArray(node.props.columns) ? node.props.columns : []) as {
    header?: unknown;
  }[];
  const rows = (Array.isArray(node.props.rows) ? node.props.rows : []) as {
    label?: unknown;
    values?: unknown;
  }[];
  // `table` is the grid of rows and columns; `cards` sets each column as its
  // own card with the rows as label/value pairs, which reads better on a phone.
  const cards = node.variant === "cards";
  const valuesOf = (row: (typeof rows)[number]): unknown[] => (Array.isArray(row.values) ? row.values : []);
  const cardColumns =
    columns.length <= 1
      ? ""
      : columns.length === 2
        ? "md:grid-cols-2"
        : columns.length === 3
          ? "md:grid-cols-3"
          : "md:grid-cols-2 lg:grid-cols-4";
  return (
    <SectionShell node={node} section="comparison">
      <div className={cx("mx-auto px-4 py-16", contentWidthClass(node))}>
        {str(node.props.title) !== "" && (
          <h2
            className="font-[family-name:var(--font-display)] text-3xl font-bold"
            style={{ ...headingStyle(node), ...alignStyle(node) }}
          >
            {str(node.props.title)}
          </h2>
        )}
        {cards ? (
          <ul className={cx("mt-8 grid gap-6", cardColumns)}>
            {columns.map((column, columnIndex) => (
              <li key={columnIndex} className="border" style={cardStyle(node)}>
                <h3 className="text-lg font-semibold">
                  {typeof column.header === "string" ? column.header : ""}
                </h3>
                <dl className="mt-4">
                  {rows.map((row, rowIndex) => {
                    const value = valuesOf(row)[columnIndex];
                    return (
                      <div
                        key={rowIndex}
                        className="flex justify-between gap-4 border-t border-[var(--line)] py-2"
                      >
                        <dt className="text-[var(--fg-muted)]">
                          {typeof row.label === "string" ? row.label : ""}
                        </dt>
                        <dd className="text-right font-semibold">
                          {typeof value === "string" ? value : ""}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-8 overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr>
                  <th scope="col" className="border-b border-[var(--line)] p-3">
                    <span className="sr-only">Merkmal</span>
                  </th>
                  {columns.map((column, index) => (
                    <th key={index} scope="col" className="border-b border-[var(--line)] p-3 font-semibold">
                      {typeof column.header === "string" ? column.header : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    <th scope="row" className="border-b border-[var(--line)] p-3 font-semibold">
                      {typeof row.label === "string" ? row.label : ""}
                    </th>
                    {valuesOf(row).map((value: unknown, valueIndex: number) => (
                      <td key={valueIndex} className="border-b border-[var(--line)] p-3">
                        {typeof value === "string" ? value : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SectionShell>
  );
}
