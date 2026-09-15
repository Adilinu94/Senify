import { resolveAsset, SectionShell, str, type SectionProps } from "./shared.tsx";

export function Team({ node, ctx }: SectionProps): React.JSX.Element {
  const members = (Array.isArray(node.props.members) ? node.props.members : []) as {
    photo?: unknown;
    name?: unknown;
    role?: unknown;
  }[];
  return (
    <SectionShell node={node} section="team">
      <div className="mx-auto max-w-6xl px-4 py-16">
        {str(node.props.title) !== "" && (
          <h2 className="font-[var(--font-display)] text-3xl font-bold">{str(node.props.title)}</h2>
        )}
        <ul className="mt-10 grid gap-6 sm:grid-cols-3">
          {members.map((member, index) => {
            const photo = resolveAsset(member.photo, ctx);
            return (
              <li
                key={index}
                className="rounded-[var(--radius-lg)] border border-[var(--line)] p-6 text-center"
              >
                {photo ? (
                  <img
                    src={photo.src}
                    alt={typeof member.name === "string" ? member.name : ""}
                    loading="lazy"
                    data-missing-asset={photo.missing ? "" : undefined}
                    className="mx-auto h-20 w-20 rounded-full object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--bg-muted)] font-[var(--font-display)] text-2xl font-bold"
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
