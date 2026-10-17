import { Type, type Static } from "@sinclair/typebox";
import type { PropValue } from "@senify/section-sdk";
import { AuthorSchema } from "./mutations/contract.ts";

const CLOSED = { additionalProperties: false } as const;

export const SiteProfileSchema = Type.Union([
  Type.Literal("clean"),
  Type.Literal("standard"),
  Type.Literal("showcase"),
]);

// `PATCH /api/sites/:siteId` carries a rename, a profile change (ticket 20)
// the public address and/or the breakpoint pair. At least one field has to be
// present; the handler rejects an empty update instead of writing a silent
// no-op. `baseUrl` is validated and normalized in the store; `null` or blank
// clears it. `breakpoints` (ADR-0020) is a `{ tablet, mobile }` pair checked
// against the guard rails in the store; `null` returns to the platform default.
// The numbers are checked there, not by this schema, so one message names the
// rule that failed.
export const UpdateSiteBodySchema = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 1 })),
    profile: Type.Optional(SiteProfileSchema),
    baseUrl: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    breakpoints: Type.Optional(
      Type.Union([Type.Object({ tablet: Type.Number(), mobile: Type.Number() }, CLOSED), Type.Null()]),
    ),
    author: Type.Optional(AuthorSchema),
  },
  CLOSED,
);
export type UpdateSiteBody = Static<typeof UpdateSiteBodySchema>;

export const SiteEventBodySchema = Type.Object(
  {
    baseVersion: Type.Optional(Type.Number({ minimum: 0 })),
    author: Type.Optional(AuthorSchema),
  },
  CLOSED,
);
export type SiteEventBody = Static<typeof SiteEventBodySchema>;

export const DuplicateSiteBodySchema = Type.Object(
  {
    withContent: Type.Optional(Type.Boolean()),
    author: Type.Optional(AuthorSchema),
  },
  CLOSED,
);
export type DuplicateSiteBody = Static<typeof DuplicateSiteBodySchema>;

// Style rules (Phase 2). The registry is site-wide, so the rules live under the
// site and not under a page. Values are the device-suffixed bag the widget
// engine already compiles (`padding`, `padding_tablet`); context styles carry
// custom conditions only (see `RESERVED_CONTEXT_IDS`).
const StyleRuleKindSchema = Type.Union([
  Type.Literal("class"),
  Type.Literal("ambient"),
  Type.Literal("scoped"),
]);

const StyleBagSchema = Type.Record(
  Type.String(),
  Type.Unsafe<PropValue>(Type.Any()),
);

const ContextStylesSchema = Type.Record(Type.String(), StyleBagSchema);

// The four pseudo states of a rule (O11). A bag per state, same shape as
// `styles`; an unknown state is rejected by the closed object.
const StatesSchema = Type.Object(
  {
    hover: Type.Optional(StyleBagSchema),
    focus: Type.Optional(StyleBagSchema),
    active: Type.Optional(StyleBagSchema),
    disabled: Type.Optional(StyleBagSchema),
  },
  CLOSED,
);

// Author provenance (ADR-0005). Distinct from `origin`, which is import
// provenance; ticket 18 hangs its write fence on this field.
const StyleRuleAuthorSchema = Type.Union([
  Type.Literal("user"),
  Type.Literal("agent"),
  Type.Literal("preset"),
]);

// Declaration priorities and the one raw at-rule the model carries. Part of the
// canonical rule, so the transport must not reject a rule that uses them.
const PriorityMapSchema = Type.Record(Type.String(), Type.Literal("important"));
const StatePrioritiesSchema = Type.Object(
  {
    hover: Type.Optional(PriorityMapSchema),
    focus: Type.Optional(PriorityMapSchema),
    active: Type.Optional(PriorityMapSchema),
    disabled: Type.Optional(PriorityMapSchema),
  },
  CLOSED,
);

export const CreateStyleRuleBodySchema = Type.Object(
  {
    id: Type.Optional(Type.String({ minLength: 1 })),
    name: Type.String({ minLength: 1 }),
    kind: Type.Optional(StyleRuleKindSchema),
    selector: Type.Optional(Type.String({ minLength: 1 })),
    nodeId: Type.Optional(Type.String({ minLength: 1 })),
    description: Type.Optional(Type.String()),
    styles: Type.Optional(StyleBagSchema),
    stylePriorities: Type.Optional(PriorityMapSchema),
    states: Type.Optional(StatesSchema),
    statePriorities: Type.Optional(StatePrioritiesSchema),
    contextStyles: Type.Optional(ContextStylesSchema),
    contextStylePriorities: Type.Optional(Type.Record(Type.String(), PriorityMapSchema)),
    rawCss: Type.Optional(Type.String()),
    authoredBy: Type.Optional(StyleRuleAuthorSchema),
    baseVersion: Type.Optional(Type.Number({ minimum: 0 })),
    author: Type.Optional(AuthorSchema),
  },
  CLOSED,
);
export type CreateStyleRuleBody = Static<typeof CreateStyleRuleBodySchema>;

export const UpdateStyleRuleBodySchema = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 1 })),
    selector: Type.Optional(Type.String({ minLength: 1 })),
    description: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    styles: Type.Optional(StyleBagSchema),
    stylePriorities: Type.Optional(PriorityMapSchema),
    states: Type.Optional(StatesSchema),
    statePriorities: Type.Optional(StatePrioritiesSchema),
    contextStyles: Type.Optional(ContextStylesSchema),
    contextStylePriorities: Type.Optional(Type.Record(Type.String(), PriorityMapSchema)),
    rawCss: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    authoredBy: Type.Optional(StyleRuleAuthorSchema),
    baseVersion: Type.Optional(Type.Number({ minimum: 0 })),
    author: Type.Optional(AuthorSchema),
  },
  CLOSED,
);
export type UpdateStyleRuleBody = Static<typeof UpdateStyleRuleBodySchema>;

export const ReorderStyleRuleBodySchema = Type.Object(
  {
    index: Type.Integer({ minimum: 0 }),
    baseVersion: Type.Optional(Type.Number({ minimum: 0 })),
    author: Type.Optional(AuthorSchema),
  },
  CLOSED,
);
export type ReorderStyleRuleBody = Static<typeof ReorderStyleRuleBodySchema>;
