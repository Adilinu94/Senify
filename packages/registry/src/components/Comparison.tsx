import {
  alignStyle,
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
                  {(Array.isArray(row.values) ? row.values : []).map(
                    (value: unknown, valueIndex: number) => (
                      <td key={valueIndex} className="border-b border-[var(--line)] p-3">
                        {typeof value === "string" ? value : ""}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </SectionShell>
  );
}
