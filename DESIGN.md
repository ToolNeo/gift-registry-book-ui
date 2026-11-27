---
name: 在线礼簿 (Online Gift Registry)
description: Luminous Ant Design blue-and-white visual system calibrated to Stripe and Linear light-mode craft.
colors:
  cobalt-primary: "#1677ff"
  sapphire-hover: "#0e65e5"
  cobalt-deep: "#0958d9"
  ink-obsidian: "#0f172a"
  slate-label: "#334155"
  slate-muted: "#526277"
  mist-border: "#d8e2f0"
  sky-border-hover: "#9ec2f7"
  frost-divider: "#eaf0f7"
  paper-white: "#ffffff"
  recessed-ice: "#f8fafd"
  alabaster-ground: "#f4f7fc"
  emerald-success: "#16a34a"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: "0.84375rem"
    fontWeight: 500
    lineHeight: 1.48
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "14px"
  xl: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "36px"
  3xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.cobalt-primary}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.md}"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.sapphire-hover}"
    textColor: "{colors.paper-white}"
  button-primary-active:
    backgroundColor: "{colors.cobalt-deep}"
    textColor: "{colors.paper-white}"
  input-field:
    backgroundColor: "{colors.recessed-ice}"
    textColor: "{colors.ink-obsidian}"
    rounded: "{rounded.md}"
    height: "44px"
  auth-card:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.ink-obsidian}"
    rounded: "{rounded.xl}"
    padding: "36px 40px 24px"
    width: "456px"
  language-pill:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.slate-label}"
    rounded: "{rounded.pill}"
    height: "36px"
    padding: "0 14px"
---

# Design System: 在线礼簿 (Online Gift Registry)

## Overview

**Creative North Star: "Luminous Sapphire Precision"**

This visual system unifies the entry experience of 在线礼簿 with its Ant Design administration workbench through a calm, high-key blue-and-white language calibrated to Stripe and Linear light-mode craftsmanship. Because hosts and family bookkeepers open the ledger across every Chinese life milestone—from weddings and birthdays to solemn memorials—the shared entry deliberately refuses occasion-biased ornament, gloomy muted greens, and noisy gradients in favor of luminous optical clarity.

Structure and restraint lead every decision. A bright alabaster spatial canvas with diffused glacier-blue light ribbons holds the perimeter while pure white working surfaces sit cleanly above it through calibrated two-part atmospheric shadows. Blue-tinted slate neutrals, crisp 44px touch-ready form controls, and deepened sapphire interaction states create quiet authority without visual fatigue.

**Key Characteristics:**
- Seamless `#1677ff` primary continuity between authentication entry and the Ant Design admin console
- Blue-tinted slate neutrals across typography, borders, and recessed inputs rather than lifeless raw grays
- Single-declaration elevation using soft two-part shadows with zero ghost double borders
- Purposeful micro-interactions with exponential ease-out timing and full reduced-motion compliance
- Themed browser-native surfaces including selection tint, caret color, autofill preservation, focus rings, and tabular numerals

## Colors

A focused single-accent palette anchored by Ant Design Cobalt Blue paired with cool blue-tinted slate neutrals for calm, occasion-neutral authority.

### Primary
- **Cobalt Primary** (`#1677ff`): Primary submit actions, interactive links, active focus rings, caret color, and the brand badge mark.
- **Sapphire Hover** (`#0e65e5`): Hover state for primary buttons and links; deepens rather than washes out so white CTA labels retain >5:1 contrast.
- **Cobalt Deep** (`#0958d9`): Active/pressed state for primary buttons and the dark edge of the brand mark gradient.

### Neutral
- **Ink Obsidian** (`#0f172a`): Primary headings, brand title, and entered input values (≥16:1 on white).
- **Slate Label** (`#334155`): Form field labels, language pill text, and bottom footer typography over the alabaster fade veil (≥4.5:1 across desktop and mobile).
- **Slate Muted** (`#526277`): Supporting subtitles, password rule captions, and secondary guidance inside white cards (~6.2:1 on white).
- **Mist Border** (`#d8e2f0`): Resting hairline stroke on inputs and inline captcha controls.
- **Sky Border Hover** (`#9ec2f7`): Hover stroke on inputs and captcha refresh surfaces.
- **Frost Divider** (`#eaf0f7`): Internal horizontal rules separating primary forms from secondary account actions.
- **Paper White** (`#ffffff`): Elevated card surface and focused input fill.
- **Recessed Ice** (`#f8fafd`): Resting fill for inputs and inline captcha wells, creating clear polarity inside pure white cards.
- **Alabaster Ground** (`#f4f7fc`): Full-screen fallback canvas behind the luminous abstract backdrop and base tone of the footer readability veil.
- **Emerald Success** (`#16a34a`): Confirmed status feedback in Ant Design tokens.

### Named Rules
**The Deepening Hover Rule.** Primary blue controls must darken toward Sapphire Hover (`#0e65e5`) on hover rather than lightening toward pale sky tones, preserving WCAG AA white-text contrast in every interactive state.
**The Footer Veil Rule.** Text laid over full-bleed light artwork uses Slate Label (`#334155`) backed by a subtle transparent-to-Alabaster Ground bottom gradient veil so light ribbons or creases never reduce contrast below 4.5:1.

## Typography

**UI & Display Stack:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif`

**Character:** A single Latin-first system UI sans stack gives English UI labels and numeric verification codes crisp native Latin metrics while resolving Simplified Chinese cleanly to PingFang SC / Microsoft YaHei without jagged bitmap fallbacks.

### Hierarchy
- **Display (Auth Card Heading)** (`600`, `1.5rem` desktop / `1.375rem` expanded & mobile, `line-height: 1.3`, `letter-spacing: -0.02em`): Primary view title (`登录礼簿`, `注册账号`, `忘记密码`).
- **Title (Brand Lockup)** (`600`, `1.1875rem` desktop / `1.0625rem` mobile, `line-height: 1.3`, `letter-spacing: -0.01em`): Top-left product name beside the squircle badge.
- **Body** (`400`, `0.875rem`, `line-height: 1.5`): Subtitle copy, form input text, and primary button labels (`500` weight on buttons).
- **Label** (`500`, `0.84375rem`, `line-height: 20px`): Form labels above inputs and compact utility links.
- **Caption** (`400`, `0.75rem`, `line-height: 18px`): Footer tagline, copyright/filing links, password rules, and email delivery status hints.

### Named Rules
**The Tabular Verification Rule.** Verification code inputs, email OTP fields, and resend countdown buttons apply `font-variant-numeric: tabular-nums` so numbers align cleanly and countdown text never jitters horizontally.

## Layout

The authentication shell uses a three-row full-viewport CSS Grid (`80px 1fr auto` on desktop, `76px 1fr auto` at `<= 48rem`) layered over a `position: fixed` full-screen background (`object-fit: cover; object-position: center`).

- **Top bar:** Horizontal flex strip with `48px` desktop (`24px` mobile) inline padding anchoring the brand mark left and the language toggle right.
- **Center stage:** Single centered card with fixed natural widths (`456px` for sign-in, `520px` for two-column registration/password reset, collapsing fluidly with `20px` stage padding to `350px` on `390px` viewports).
- **Field rhythm:** `18px` vertical item spacing on sign-in, `12px` compact rhythm on multi-field embedded registration/reset forms, and `10px` consistent horizontal gap across both graphic captcha and email code rows (`132px` right control width, shrinking to `112px` at `<= 22rem`).
- **Responsive touch discipline:** Below `48rem`, paired fields stack into a single column and all interactive links, checkboxes, and the language switcher expand to `>= 44px` minimum height.

## Elevation & Depth

Elevation relies on a clean two-part atmospheric shadow system paired with tonal polarity between Paper White cards and Recessed Ice inputs. Cards declare elevation once through shadow alone, never stacking a 1px border underneath a wide drop shadow.

### Shadow Vocabulary
- **Card Elevated** (`box-shadow: 0 2px 8px -2px rgb(15 35 66 / 7%), 0 22px 52px -14px rgb(15 35 66 / 14%)`): Primary floating authentication card over the full-screen canvas.
- **Primary CTA Rest** (`box-shadow: 0 1px 2px rgb(9 88 217 / 22%), 0 6px 16px -4px rgb(22 119 255 / 34%)`): Grounded lift under primary submit buttons.
- **Primary CTA Hover** (`box-shadow: 0 2px 4px rgb(9 88 217 / 26%), 0 10px 22px -6px rgb(14 101 229 / 44%)`): Subtle forward lift on pointer hover, compressing cleanly to `1px` inset shadow and `translateY(1px)` on `:active`.
- **Focus Ring Halo** (`box-shadow: 0 0 0 3px rgb(22 119 255 / 14%)`): Soft cobalt focus aura around active text fields and captcha buttons.

### Named Rules
**The Single-Elevation Rule.** Elevated cards announce height through a two-part offset-and-blur shadow without an extra 1px border ring; recessed inputs reverse the logic with subtle tonal fill and hairline border.

## Shapes

Controlled, modern geometric radii scale directly with element size: `4px` on inline focusable links, `8px` on inputs, buttons, alerts, and captcha controls, `9px` (`8px` mobile) on the brand squircle mark, `16px` (`14px` mobile) on the centered card, and `999px` pill geometry strictly reserved for compact utility chips such as the language switcher.

## Components

Every interactive component shares one exponential ease-out timing curve (`cubic-bezier(0.16, 1, 0.3, 1)`, `160ms–180ms`), full hover/focus/active/disabled/loading states, and zero transitions under `prefers-reduced-motion: reduce`.

### Buttons
- **Shape:** Gently rounded rectangle (`8px` radius, `44px` min-height).
- **Primary:** Full-width Cobalt Primary (`#1677ff`) fill, Paper White (`#ffffff`) label (`500` weight, `0.02em` tracking), paired with Primary CTA shadows.
- **Hover / Focus / Active:** Deepens to Sapphire Hover (`#0e65e5`) on hover, Cobalt Deep (`#0958d9`) with `1px` downward press on active.
- **Text / Link Actions:** Cobalt Primary text with `text-underline-offset: 3px` underline on hover; expands to `44px` minimum tap height on mobile.

### Cards / Containers
- **Corner Style:** Soft architectural card radius (`16px` desktop, `14px` mobile).
- **Background:** Solid Paper White (`#ffffff`) for crisp WCAG contrast against bright abstract imagery.
- **Shadow Strategy:** Card Elevated two-part atmospheric shadow; no competing outer border.
- **Internal Padding:** `36px 40px 24px` on sign-in, `28px 36px 22px` on expanded registration/reset, tightening to `28px 24px 20px` on mobile.

### Inputs / Fields
- **Style:** `44px` height, `8px` radius, `1px` Mist Border (`#d8e2f0`), Recessed Ice (`#f8fafd`) fill at rest.
- **Hover / Focus:** Transitions to Paper White (`#ffffff`) fill with Sky Border Hover (`#9ec2f7`), locking to Cobalt Primary (`#1677ff`) + Focus Ring Halo when focused; `:-webkit-autofill` preserves Recessed Ice fill and Ink Obsidian text.
- **Captcha Control:** `10px` horizontal gap separating flex-grow code input from a `132px × 44px` refresh button (`112px` at `<= 22rem`) that hides its image while loading so spinner and image never collide.

### Navigation / Top Bar
- **Brand Lockup:** `34px` (`30px` mobile) cobalt squircle logo (`logo.svg`) with subtle cobalt drop shadow alongside `1.1875rem` semibold product title.
- **Language Switcher:** Translucent Paper White (`80%`) pill (`999px` radius, `36px` desktop / `44px` mobile height) with globe icon and active locale text—direct one-click toggle with no misleading dropdown chevron.

### Embedded Multi-Mode Auth Card
Sign-in, registration, and password reset share one centered container without overlay modals. Initial page paint renders immediately at full opacity; subsequent view transitions animate softly (`opacity` + `4px` vertical rise over `180ms`) and restore keyboard focus deterministically (`heading` on embedded view mount, `username` input on return to login, `Escape` returns to login).

## Do's and Don'ts

### Do:
- **Do** keep primary interactions anchored to `#1677ff` → `#0e65e5` → `#0958d9` so authentication flows seamlessly into the Ant Design admin workspace.
- **Do** enforce `>= 44px` touch targets on all mobile interactive elements (`<= 48rem`), including utility pills, checkboxes, and text links.
- **Do** preserve `10px` horizontal gaps across stacked inline control rows (graphic captcha and email code) so right input edges align cleanly.
- **Do** theme native browser affordances (`::selection`, `caret-color`, `:focus-visible`, `:-webkit-autofill`, `scrollbar-color`, `tabular-nums`) from the palette.

### Don't:
- **Don't** introduce occasion-specific wedding red/gold or funeral olive-green styling on shared authentication surfaces.
- **Don't** stack a `1px` border or zero-blur `0 0 0 1px` ring onto an elevated card that already carries a wide soft shadow.
- **Don't** use lighter pale-blue hover fills (`#4096ff`) on white-text primary buttons where contrast drops below 4.5:1.
- **Don't** add decorative chevrons to direct-toggle buttons or show configuration retry buttons after ordinary credential errors.
