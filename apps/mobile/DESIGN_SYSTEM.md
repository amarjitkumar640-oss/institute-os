# Mobile design system — popups, sheets, dialogs, avatars, typography, and theme

This file exists because an audit of every modal/sheet/picker/dialog in the app (36 of
them, across 15 files) found ~18 with a literal hardcoded color that ignored the theme,
and 7 different bottom-sheet height values with 4 sheets having no height cap at all.
A second audit of every list screen's leading avatar/icon found 5 different sizes, 3
different corner-radius/shape treatments, and 3 different fill philosophies (solid,
tinted-with-border, tinted-no-border) for what's conceptually one element. A third,
app-wide audit of every screen's typography found 18+ distinct font sizes doing the
job of ~12 real roles, and `Inter_800ExtraBold` used almost as often as
`Inter_700Bold` (210 vs 245 occurrences) for what was visually the same role, with no
rule governing which a given screen picked. All of it was fixed in place. **The rules
below are what keeps it fixed** — read this before adding or editing any popup,
list-screen card, or screen's text styles, not after.

## Color — never hardcode, always `colors.x`

`useThemeColors()` (from `context/ThemeContext.tsx`) is the *only* thing popup code
should import for color. It returns everything you need:

- **Brand-configurable**: `colors.primary`, `colors.secondary`, `colors.accent`,
  `colors.bg`, `colors.safeArea`, `colors.screenBg`, `colors.headerBg`, `colors.headerText`
  — these change when an institute updates its branding.
- **Fixed regardless of brand**: `colors.card`, `colors.text`, `colors.muted`,
  `colors.placeholder`, `colors.border`, `colors.inputBg`, and the semantic set
  `colors.green` / `colors.red` / `colors.orange` / `colors.blue` / `colors.purple`,
  each with a matching soft-tint `Bg` pair (`greenBg`, `purpleBg`, `redBg`, `orangeBg`,
  `blueBg`) for icon badges and status chips.

There's a second object, `C` from `theme.ts`, with its own values for the same
fixed-token names — it's not identical to `colors`'s fixed tokens (pre-existing drift,
see root `CLAUDE.md`). Prefer `colors.x` in any file you're touching for a popup, even
if the surrounding file already mixes in `C.x`.

**Before typing a literal hex or `rgba(...)`, ask:**

| What it's for | Use |
|---|---|
| Should shift with the tenant's brand | `colors.primary` / `.secondary` / `.accent` (+ alpha suffix like `+"18"` for a tint) |
| A fixed meaning — success / error / warning / destructive | `colors.green` / `.red` / `.orange` + its `Bg` pair. **Never** derive these from brand color — an error should always read as red no matter what color the institute picked. |
| A role identity (admin/teacher/frontdesk, `constants/roleMeta.ts`) | Intentionally fixed, not brand-derived. Leave as-is — this was a deliberate call, not an oversight. |
| A modal backdrop/overlay or a shadow | A fixed dark scrim regardless of brand is standard practice, low priority — but reuse an existing overlay value instead of inventing a new one. |
| None of the above fit | You've found a token gap. Add it to `DEFAULT_COLORS` in `ThemeContext.tsx` (and mirror the key in `theme.ts`'s `C`) rather than hardcoding — `redBg`/`orangeBg`/`blueBg` were added this exact way when `AppAlert.tsx` needed them. |

**Surfaces:**
- No card or sheet background is ever `colors.primary`/`secondary`/`accent`. Cards use
  `colors.card` (white) or a semantic `Bg` tint (e.g. `colors.greenBg` for an
  "assigned"/success card). A brand color goes on icon-badge tints and on solid CTA
  buttons — never as a fill you'd put text on top of generally.
- A per-row action repeated down a list (an "add this" button on every row) is a small
  icon-only tinted square (`colors.primary + "10"`, ~30×30), not a full-width solid
  button — reference: `BatchDetailScreen`'s `AddStudentModal` → `addBtn`. Save the bold
  full-width solid-fill treatment for a screen's one primary action.

## List-screen avatars — one size, one shape, one fill mechanism

Every list screen's leading avatar/icon box (Students, Faculty, Fees, Leads,
Applications, Staff, Courses, Subjects, Centers) gets its size, corner radius, and fill
from `components/ui/avatarStyle.ts` — never a hand-rolled `width`/`height`/`borderRadius`
or an inline solid/tinted color choice.

```ts
AVATAR_SIZE                  // the one size every list avatar uses
AVATAR_RADIUS                // the one corner radius — a squircle, not a full circle
AVATAR_FILL_STYLE            // "solid" | "tinted" — flip this one flag to compare both
                              // across every list screen at once, e.g. for a design
                              // review — no per-screen edits needed
getAvatarFill(baseColor)      // → { backgroundColor, color, borderWidth, borderColor }
```

The screen still decides *which* color an item gets (a course's category color, a
rotating palette entry, a role color, brand primary for a fixed-identity case like
Leads) — that logic stays local to each screen and is not something `avatarStyle.ts`
should own. What it must not do is decide *how* that color gets painted onto the
avatar (solid fill vs. a tint-plus-border) — that part always comes from
`getAvatarFill()`, so a future style change (or the solid/tinted comparison above)
takes effect everywhere at once instead of needing a per-screen edit.

## Bottom sheets — one primitive, three height tiers

`components/ui/BottomSheet.tsx` is the shared sheet primitive and exports:

```ts
SHEET_HEIGHT.short     // 65% — a handful of fields or one action: a form, a
                       // confirmation, a reject/reset flow
SHEET_HEIGHT.standard  // 85% — the default (omit the prop to get this) — most
                       // pickers and forms
SHEET_HEIGHT.tall      // 92% — dense grids/lists that benefit from showing more
                       // before scrolling: course grids, staff/center lists
```

Every popup's `maxHeight` — whether it's the `maxHeight` prop on `<BottomSheet>` or a
literal in a hand-rolled sheet's `StyleSheet` — must reference one of these three
constants. Never a new literal percentage. If none of the three feels right for
something new, that's a sign to reconsider the content, not to add a fourth number.

**Every sheet needs a cap, full stop.** An uncapped sheet isn't just inconsistent, it's
a real bug: keyboard open + a validation error + a short device can push the submit
button off-screen. Four sheets had this exact problem before the audit and all four now
use `SHEET_HEIGHT.short`.

New popups should use `<BottomSheet>` directly rather than hand-rolling
`<Modal transparent>` + backdrop + sheet `View`. Most existing ones predate this
component and haven't been migrated — that's a known gap, not license to add another
one the old way.

## Header / close button / search input

The shape agreed on for every popup (see `ManageCentersModal` in
`StaffManagementScreen.tsx`, or the `ps` shared styles in `StudentAdmissionScreen.tsx`'s
course/qualification pickers, as reference implementations):

- **Header**: icon badge (`colors.primary + "17"` background by default; override the
  color for a semantic context, e.g. `colors.red` for a reject/delete flow) + title +
  optional one-line subtitle + close button, all in one row.
- **Close button**: `colors.inputBg` background, `1px colors.border` outline,
  `colors.muted` icon. Not `colors.bg`, not a bare unstyled icon, not a text-only
  "Cancel" link.
- **Search input** (when present): `colors.inputBg` background, `1px colors.border`
  outline, a leading icon, and a conditional clear (`×`) button.
- Don't give a sheet two ways to close that do the same thing (e.g. a bottom "Done"
  button when a header close button already exists) unless the content is long enough
  that a bottom action genuinely saves scrolling back to the top — most short sheets
  don't need both.

## Typography — one scale, sixteen tokens, weights capped at 700

`components/ui/typography.ts` exports `T`, the single source of truth for every
font-size/family/weight/line-height/letter-spacing/case combination in the app:

```ts
T.displayLarge     // 26 / 700 — hero identity: profile name, PIN-setup step title,
                    //  a screen's single biggest number (e.g. avatar initials on a
                    //  large hero avatar)
T.displayMedium     // 20 / 700 — a prominent standalone headline: success-screen
                    //  titles, discard/info confirmation-dialog titles, a summary
                    //  card's hero figure
T.screenTitle       // 18 / 700 — reserved for ScreenHeader.tsx's own title only.
                    //  Never use this for a modal/sheet header — see cardTitle.
T.sectionHeading    // 12 / 700, uppercase — a small all-caps label above a group
                    //  of fields or rows ("PERSONAL DETAILS", "STATUS")
T.cardTitle         // 15 / 600 — a card's own title, and every modal/sheet header
                    //  title (the "Manage Centers" in a sheet's header row) —
                    //  screenTitle is for the real screen header, this is for
                    //  everything else that reads as a header
T.listItemTitle     // 14 / 600 — a list row's primary text: a student's name, a
                    //  batch name, avatar initials in a normal list avatar
T.body              // 13 / 400 — default paragraph/input text
T.bodySmall         // 12 / 400 — a secondary line under body text
T.caption           // 11 / 500 — metadata: a row's subtitle, a timestamp, a count
T.helperText        // 11.5 / 400 — form field hints and inline validation errors
T.buttonText        // 15 / 600 — PrimaryButton and any full-width primary CTA
T.chipText          // 11 / 600 — a selectable pill/chip/tab, a compact action-row
                    //  label, a status pill showing natural-case text ("Enrolled")
T.badgeText         // 10 / 700, uppercase — a small static badge/tag (a digit
                    //  badge, an exam-tag chip) — already short/static, so the
                    //  forced uppercase never surprises
T.navigationLabel   // 11 / 600 — bottom-nav tab labels
T.tableHeader       // 11 / 600, uppercase — column headers in list/table rows
T.tableCell         // 13 / 400 — table/list cell body text
```

Every screen's `StyleSheet.create` entries spread from `T.x` — `{ ...T.listItemTitle,
color: colors.text }` — rather than writing `fontSize`/`fontFamily`/`fontWeight`
literals. Color is never part of a `T` token; it always comes from `colors.x` or a
fixed `C.x`/hex at the call site, same as every other rule in this file.

**Weights are capped at 400/500/600/700 — `Inter_800ExtraBold` is not used anywhere.**
It was previously used in ~210 places for what read as the same visual role as
`Inter_700Bold` elsewhere, with no rule distinguishing when a screen reached for one
over the other. If you find yourself wanting heavier emphasis than `700` gives you,
that's a sign to reach for a bigger token (e.g. `cardTitle` → `displayMedium`), not a
heavier weight.

**Recurring mapping rules, so the same kind of element always lands on the same
token:**

| Element | Token |
|---|---|
| A modal/sheet header title (icon + title + close button row) | `cardTitle`, never `screenTitle` |
| Avatar initials, any list avatar | `listItemTitle` |
| A status/tag pill showing natural-case text ("Enrolled", "Full") | `chipText` |
| A static, already-uppercase-appropriate badge (digit badge, exam tag) | `badgeText` |
| A small inline/icon-adjacent action-row button label | `chipText` (only full-width primary CTAs get `buttonText`) |
| A currency/amount input the user types into | `displayMedium` (reads as a hero figure, not body text) |
| A confirmation-dialog title (discard/delete/info alert) | `displayMedium` |

A few call sites are deliberately left as plain literals instead of a `T` token:
tiny layout-sensitive labels with no clean token match (e.g. a step-indicator's
9px tab label, a PIN pad's large regular-weight digit), and full-screen camera/QR
overlays. These are already within the 400–700 weight cap; they're exempt from the
token system itself, not from the weight cap. If you're adding a new one of these,
ask whether it's really a special case or just a token you haven't reached for yet —
most things fit one of the sixteen.

One screen, `LoginScreen.tsx`, deliberately uses raw pixel values with no `fs()`
scaling anywhere in the file (a pre-auth screen with its own internally consistent
numeric scale) — its weights are still capped at 700, but it doesn't spread `T`
tokens, since doing so would silently introduce responsive scaling where none existed
before. Don't take this as license to skip `fs()` elsewhere; it's a one-off, called
out specifically so it isn't "fixed" by accident later.

## Semantic text-color aliases

`useThemeColors()` also returns text-role aliases, additive to the fixed/brand tokens
above — use these instead of reaching for `colors.text`/`colors.muted` when the intent
is specifically about text hierarchy or state:

```ts
colors.textPrimary    // → colors.text
colors.textSecondary  // → colors.muted
colors.textDisabled   // → colors.placeholder
colors.textInverse    // → "#fff" (white-on-brand-color text, fixed regardless of theme)
colors.success        // → colors.green
colors.warning        // → colors.orange
colors.error          // → colors.red
```
