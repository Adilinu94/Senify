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
          className={cx("mt-10 grid gap-6", columnsClass(node, "sm:grid-cols-3"))}
          style={gapStyle(node)}
        >
          {members.map((member, index) => {
            const photo = resolveAsset(member.photo, ctx);
            return (
              <li
                key={index}
                className="border text-center"
                style={cardStyle(node)}
              >
                {photo ? (
                  <ResponsiveImage
                    asset={photo}
                    alt={typeof member.name === "string" ? member.name : ""}
                    sizes={imageSizes(node)}
                    className="mx-auto h-20 w-20 object-cover"
                    style={mediaStyle(node, "9999px")}
                  />
                ) : (
                  <span
                    aria-hidden
                    className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--bg-muted)] font-[family-name:var(--font-display)] text-2xl font-bold"
                  >
                    {(typeof member.name === "string" ? member.name : "?").slice(0, 1)}
                  </span>
                )}
                <h3 className="mt-4 font-semibold">
                  {typeof member.name === "string" ? member.name : ""}
                </h3>
                {typeof member.role === "string" && member.role !== "" && (
                  <p className="text-sm text-[var(--fg-muted)]">{member.role}</p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </SectionShell>
  );
}
