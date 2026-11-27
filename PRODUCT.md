# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary users:** Family hosts, trusted relatives, and event bookkeepers recording incoming gifts and guest attendance for Chinese life-milestone events (weddings, memorials/funerals, milestone birthdays, baby full-moon/100-day/first-birthday celebrations, engagements, housewarmings, graduations, and business openings).
- **Context of use:** Desktop browsers (laptops at reception desks or home preparation) and mobile browsers (phones on-site or reviewing records on the go), often under time pressure right before or during an event.

## Product Purpose

**在线礼簿** provides a reliable online gift-registry ledger so hosts can quickly record礼金往来, verify real-time cash/WeChat totals, manage multiple events, and display occasion-appropriate public ledger boards without paper errors or lost records.

## Positioning

A unified digital gift-registry system that serves **all** Chinese life-milestone occasions—both joyous celebrations and solemn memorials—behind one calm, dignified, occasion-neutral account entry, while delegating event-specific themes to each individual event's display board.

## Operating Context

- **Entry & account workflows:** Sign in (with optional image captcha and Remember Me cookie restoration), self-service account registration (with username availability check, graphic captcha, and 6-digit email verification code), and anonymous password reset (with dual graphic + email verification).
- **Post-login workspace:** Event management table, rapid gift entry workbench, public display settings, membership/quota status, and system settings (including admin-uploaded branding assets: logo, favicon, login background, copyright, and ICP/police filing numbers).
- **Internationalization:** Bilingual Simplified Chinese (`zh`) and English (`en`) switching directly on the login screen and inside the app.

## Capabilities and Constraints

- **Stack:** Vue 3.5 + Ant Design Vue 4 + Vite 6 + Pinia + Vue Router + Vue I18n (`gift-registry-book-ui`).
- **Fixed functional requirements on auth screen:**
  - Full-screen background with centered card shared across sign-in, registration, and password reset (no modal dialogs overlapping the login surface).
  - Preserve all auth APIs, validation rules, focus management, keyboard accessibility (including Escape back to login), bilingual switcher, optional copyright & ICP/police filing links, and System Settings custom branding upload overrides (`logo`, `ico`, `background` < 4 MiB JPG/PNG).
- **Scope constraint:** Management dashboard global color scheme remains unchanged for now unless explicitly requested later.

## Brand Commitments

- **Product name:** 在线礼簿 (default display name in `project.config.json`, overridable via System Settings).
- **Standing visual alignment:** Standard Ant Design blue-and-white (`#1677ff`) language unified seamlessly with the existing admin console, executed at Stripe / Linear light-mode craft bar (luminous minimal abstract blue-white background, crisp card hierarchy, refined states and micro-interactions, zero decorative gimmick).
- **Occasion-neutral entry:** Login visual identity must stay universally dignified across weddings, birthdays, housewarmings, and funerals—avoiding wedding-only red/gold motifs and funeral-only drabness.
- **UI discipline:** Avoid redundant helper tags or decorative explanations; let clear layout, spacing, and visual hierarchy communicate structure.

## Evidence on Hand

- Existing frontend codebase: `/Volumes/2/WebStormProject/gift-registry-book-ui`
- Existing backend repository: `/Volumes/2/IdeaProject/gift-registry-book`
- Exported neutral branding directory: `docs/branding/neutral/`
- Automated Playwright E2E coverage for auth layout, registration, password reset, email delivery state, locale switching, and branding fallback (`tests/e2e/`).

## Product Principles

1. **Occasion-neutral dignity at the door:** The shared entry belongs to every milestone of life equally, never favoring one ceremony over another.
2. **Clarity over ornament:** Bookkeepers arrive to get work done; form controls, labels, errors, and recovery paths must read immediately without decorative noise.
3. **Trust through permanence:** Records of human reciprocity feel lasting and well-kept when spacing, alignment, and feedback feel composed and dependable.
4. **Seamless responsiveness:** Reception laptops and pocket smartphones receive equally complete, overflow-free auth and ledger workflows.

## Accessibility & Inclusion

- WCAG 2.2 AA contrast (≥ 4.5:1 for body text and controls, ≥ 3:1 for large headings/UI components).
- Full keyboard navigation, visible focus states, screen-reader landmarks (`region` / `aria-labelledby`), and support for browser autofill and password managers (never block paste).
- Touch targets ≥ 44px on mobile and `prefers-reduced-motion` respected.
