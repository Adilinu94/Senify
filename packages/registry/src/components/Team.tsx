import {
  alignStyle,
  cardStyle,
  columnsClass,
  contentWidthClass,
  cx,
  gapStyle,
  headingStyle,
  imageSizes,
  mediaStyle,
  resolveAsset,
  ResponsiveImage,
  SectionShell,
  str,
  type SectionProps,
} from "./shared.tsx";

export function Team({ node, ctx }: SectionProps): React.JSX.Element {
  const members = (Array.isArray(node.props.members) ? node.props.members : []) as {
    photo?: unknown;
    name?: unknown;
    role?: unknown;
  }[];
  // `grid` keeps the centred cards with a round portrait; `cards` gives each
  // person a large, square portrait on top of a left-aligned card; `compact`
  // is a quiet roster — small portrait beside name and role, no card.
  const variant = node.variant === "cards" || node.variant === "compact" ? node.variant : "grid";
  const compact = variant === "compact";
  const nameOf = (member: (typeof members)[number]): string =>
    typeof member.name === "string" ? member.name : "";
  const roleOf = (member: (typeof members)[number]): React.JSX.Element | null =>
    typeof member.role === "string" && member.role !== "" ? (
      <p className="text-sm text-[var(--fg-muted)]">{member.role}</p>
    ) : null;
  return (
    <SectionShell node={node} section="team">
      <div className={cx("mx-auto px-4 py-16", contentWidthClass(node))}>
        {str(node.props.title) !== "" && (
          <h2
            className="font-[family-name:var(--font-display)] text-3xl font-bold"
            style={{ ...headingStyle(node), ...alignStyle(node) }}
          >
            {str(node.props.title)}
          </h2>
        )}
        <ul
          className={cx(
            "mt-10 grid gap-6",
            columnsClass(node, compact ? "sm:grid-cols-2" : variant === "cards" ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-3"),
          )}
          style={gapStyle(node)}
        >
          {members.map((member, index) => {
            const photo = resolveAsset(member.photo, ctx);
            const initial = (typeof member.name === "string" ? member.name : "?").slice(0, 1);
            if (variant === "cards") {
              return (
                <li key={index} className="overflow-hidden border" style={cardStyle(node, { padding: "0" })}>
                  {photo ? (
                    <ResponsiveImage
                      asset={photo}
                      alt={nameOf(member)}
                      sizes={imageSizes(node)}
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="flex aspect-square w-full items-center justify-center bg-[var(--bg-muted)] font-[family-name:var(--font-display)] text-6xl font-bold"
                    >
                      {initial}
                    </span>
                  )}
                  <div style={{ padding: "var(--card-pad, 1.25rem)" }}>
                    <h3 className="font-semibold">{nameOf(member)}</h3>
                    {roleOf(member)}
                  </div>
                </li>
              );
            }
            if (compact) {
              return (
                <li key={index} className="flex items-center gap-4">
                  {photo ? (
                    <ResponsiveImage
                      asset={photo}
                      alt={nameOf(member)}
                      sizes={imageSizes(node)}
                      className="h-12 w-12 shrink-0 object-cover"
                      style={mediaStyle(node, "9999px")}
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--bg-muted)] font-[family-name:var(--font-display)] text-lg font-bold"
                    >
                      {initial}
                    </span>
                  )}
                  <div>
                    <h3 className="font-semibold">{nameOf(member)}</h3>
                    {roleOf(member)}
                  </div>
                </li>
              );
            }
            return (
              <li key={index} className="border text-center" style={cardStyle(node)}>
                {photo ? (
                  <ResponsiveImage
                    asset={photo}
                    alt={nameOf(member)}
                    sizes={imageSizes(node)}
                    className="mx-auto h-20 w-20 object-cover"
                    style={mediaStyle(node, "9999px")}
                  />
                ) : (
                  <span
                    aria-hidden
                    className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--bg-muted)] font-[family-name:var(--font-display)] text-2xl font-bold"
                  >
                    {initial}
                  </span>
                )}
                <h3 className="mt-4 font-semibold">{nameOf(member)}</h3>
                {roleOf(member)}
              </li>
            );
          })}
        </ul>
      </div>
    </SectionShell>
  );
}
