# Design brief

This is the design plan the `frontend-design` skill asks for. Build from it, and bring proposed changes of direction to the human.

**Subject:** one shared mishnayos chart in memory of a person. **Audience:** someone holding a phone in shul after scanning a sign, often a family in aveilus. **Primary job:** show what is still open and let someone take it.

Design the 360px screen first, then let it open up for desktop.

## Concept: the title page and the tallis

The page opens like the title page of a sefer: the honoree's name, centered, set large in classic Hebrew type. Beneath it sits the one memorable element, the **Shas map**. Everything else stays quiet.

**The Shas map** shows all of Shas at once, which no paper chart in a single shul can do. It has six rows, one per seder. Each row is divided into its masechtos, with each segment's width proportional to its number of perakim, so Keilim is long and Kinnim is a sliver. It is display-only, and carries a text alternative stating the counts.

**State is shown by pattern, drawn from tallis stripes**, so it reads in sunlight, in grayscale and for color-blind users:

| State | Map segment | List row |
| --- | --- | --- |
| Open | Empty, thin outline | Outline circle, "Open" |
| Selected | Heavy tekhelet outline | Filled circle with check, "Selected", tekhelet wash on the row |
| Taken | Diagonal tekhelet stripes | Striped circle, holder's name |
| Finished | Solid tekhelet | Solid circle with check, holder's name, "Finished" |

When every segment is solid, the map itself is the siyum.

## Tokens

Defined once in the Tailwind theme and used by name.

| Token | Value | Use |
| --- | --- | --- |
| `wool` | `#F7F8F6` | Page background, a cool tallis white |
| `surface` | `#FFFFFF` | Inputs, sticky bar |
| `ink` | `#14202E` | Text, a blue-black like ksav ink |
| `ink-muted` | `#55616E` | Secondary text |
| `line` | `#D5DAE0` | Row dividers |
| `line-strong` | `#8A96A3` | Open-state outlines, input borders |
| `tekhelet` | `#1D4F91` | The single accent: state, primary actions, links |
| `tekhelet-wash` | `#E3ECF6` | Selected rows |
| `error` | `#A12B2B` | Errors only |

## Type

- **Frank Ruhl Libre** for Hebrew: the honoree name and masechta names. It descends from the typeface of Hebrew siddurim and seforim. The honoree name is the largest thing on any page it appears on.
- **Assistant** for all English interface text, and small Hebrew such as dates.
- Scale: 14, 16, 20, 26, 40, with the honoree name fluid from 40 up to 72. Body 16/24.
- Self-host only the weights used, with `font-display: swap`.
- Line length stays under 80 characters.

## Layout

Phone, public page:

```
          נפתלי בן יעקב
    Learned l'ilui nishmaso
    Hebrew and English target date

   ▓▓▓│▓▓│▒▒│  │▒│▓▓▓│  │▒▒│▓│ │     six rows,
   ▓▓▓▓▓▓│▒▒▒│▓▓│  │▓│▒│  │ │▓│▓     widths by perakim
   ...
   41 of 63 finished, 12 taken, 10 open

   Show only what's open       [toggle]

   Zeraim                         זרעים
   ─────────────────────────────────────
   ○ Berachos, 9 perakim          ברכות
   ─────────────────────────────────────
   ◍ Peah, Moshe K.                 פאה
   ─────────────────────────────────────
  [ 2 selected              Continue ]
```

- Title block is centered. The list is two-sided like a bilingual sefer: English on the left, Hebrew on the right.
- Masechtos are ruled rows on the page rather than cards. The dividers separate real list items.
- Desktop from 1024px: the title and Shas map hold a sticky left column, with the list scrolling on the right. Below that, a single column near 560px.
- Organizer pages share the type and tokens, and are plainer: the name is smaller, and tables use the width.

## Restraint

- Corners: 6px on buttons and inputs, square map segments.
- Flat surfaces, with structure from rules and spacing.
- Text labels stay in sentence case, and each heading stands alone without a label above it.
- Numbers appear only where they count something real, such as perakim.
- One motion moment: when someone takes a masechta, its segment fills in on the map. Other motion only answers a tap, and all of it stops under `prefers-reduced-motion`.

## Words

Plain and respectful, and written for the person holding the phone.

- An action keeps its name through the flow: "Take these masechtos" leads to "Taken", "Mark finished" leads to "Finished", "Give it back".
- Errors say what happened and what to do: "Someone just took Peah. Your other choices are still selected."
- Empty states invite the next action. The siyum message is brief.

## Phone rules

- Tap targets are at least 44px tall, with 8px between neighbouring targets.
- Form inputs use a font size of at least 16px, which stops iOS Safari zooming the page on focus.
- Inputs set the right `type`, `inputMode` and `autocomplete` (`tel`, `email`, `name`).
- Sticky bottom bars respect `env(safe-area-inset-bottom)`. Full-height layouts use `dvh` units.
- The primary action sits within thumb reach, and stays visible above the on-screen keyboard or directly follows the last field.
- Every interaction works by tap alone, with hover used only as an enhancement.

## Everywhere

- Text contrast meets WCAG AA, and every control is reachable by keyboard with a visible focus ring.
- Loading uses skeletons shaped like the content.
- Hebrew follows the rule in `ARCHITECTURE.md`, and long names wrap without clipping.
