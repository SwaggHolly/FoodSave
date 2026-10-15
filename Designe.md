---
name: EcoRescue Fresh
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#3d4a42'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#6d7a72'
  outline-variant: '#bccac0'
  surface-tint: '#006c4a'
  primary: '#006948'
  on-primary: '#ffffff'
  primary-container: '#00855d'
  on-primary-container: '#f5fff7'
  inverse-primary: '#68dba9'
  secondary: '#a73a00'
  on-secondary: '#ffffff'
  secondary-container: '#fd651e'
  on-secondary-container: '#571a00'
  tertiary: '#825100'
  on-tertiary: '#ffffff'
  tertiary-container: '#a36700'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#85f8c4'
  primary-fixed-dim: '#68dba9'
  on-primary-fixed: '#002114'
  on-primary-fixed-variant: '#005137'
  secondary-fixed: '#ffdbce'
  secondary-fixed-dim: '#ffb599'
  on-secondary-fixed: '#370e00'
  on-secondary-fixed-variant: '#7f2b00'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.025em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-xl:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

The design system is engineered for a circular economy food-rescue platform connecting conscious consumers with local bakeries, markets, and restaurants to prevent surplus food waste. The brand personality balances environmental responsibility with everyday culinary delight: vibrant, fresh, trustworthy, and actionable.

The aesthetic direction blends Modern Clean with Tactile Freshness. Interfaces utilize spacious layouts, crisp white surfaces, organic rounded geometry, and energetic culinary accents. Visual tone avoids clinical or somber environmental warnings; instead, it reframes surplus food rescue into an appetizing, value-driven daily habit that feels rewarding and community-focused.

## Colors

- **Primary (`#059669`)**: Fresh emerald green anchors the brand in vitality, sustainability, and plant-forward consciousness. Used for verified status badges, environmental impact trackers, active filter selections, and secondary confirmations.
- **Secondary (`#EA580C`)**: Deep appetizing persimmon orange fuels immediate purchasing momentum. Dedicated to primary transactional CTAs ("Claim Surprise Bag", "Reserve Meal"), price cut-offs, and critical urgency elements.
- **Tertiary (`#F59E0B`)**: Warm golden amber drives attention to expiring pickup windows, countdown timers, quantity warnings, and discovery highlights.
- **Neutral (`#0F172A`)**: Deep slate for high-contrast typography, structural outlines, and crisp grounding dividers. Canvas backgrounds leverage crisp off-whites (`#F8FAFC` to `#FFFFFF`) paired with soft slate borders (`#E2E8F0`) to ensure high food photography pop without visual clutter.

## Typography

The design system implements `Inter` across all functional roles to prioritize cross-platform legibility, compact metric scales, and dense numerical display (weights, times, prices). 

Tight negative letter tracking is applied across large display formats to command consumer attention without appearing heavy-handed. Tabular numerical figures (`tnum`) should be enabled for all inventory tickers, savings counters, and pickup countdown timers to eliminate layout jitter.

## Layout & Spacing

A 12-column responsive fluid grid governs desktop and tablet breakpoints, transitioning to a flexible 4-column layout below 640px.

- **Desktop (1024px+)**: Max content container of 1280px, 24px gutters, 32px canvas margins.
- **Tablet (641px - 1023px)**: 8 columns, 20px gutters, 24px canvas margins.
- **Mobile (<=640px)**: 4 columns, 16px gutters, 16px canvas margins.

Vertical rhythm follows a strict 4px/8px modular base: `space-xs` (4px) for inline badge metadata, `space-sm` (8px) for related form-item clusters, `space-md` (16px) for interior card padding, and `space-xl` (40px) for macro section isolation.

## Elevation & Depth

Visual hierarchy uses clean multi-layered surfaces with diffuse slate-tinted ambient shadows, avoiding dark mud-toned drop shadows.

- **Level 0 (Flat / Canvas)**: `#F8FAFC` base surface, borderless.
- **Level 1 (Resting Cards & Listings)**: Solid `#FFFFFF` fill with a 1px border (`#E2E8F0`) and an ambient shadow: `0 1px 3px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.03)`.
- **Level 2 (Hover States, Dropdowns & Popovers)**: Solid `#FFFFFF`, border `#CBD5E1`, with dynamic lift shadow: `0 4px 6px -1px rgba(15, 23, 42, 0.06), 0 12px 24px -4px rgba(15, 23, 42, 0.08)`.
- **Level 3 (Modals & Persistent Bottom Sheets)**: Elevated surface framed with a slight green/slate blend ambient shadow: `0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.05)`, paired with a 40% opacity slate scrim (`rgba(15, 23, 42, 0.4)`) with backdrop blur (4px).

## Shapes

The interface embraces organic, friendly rounded forms that echo natural food elements and sustainable design warmth. 

- Core interactive elements (buttons, inputs) employ `rounded-lg` (16px).
- Content cards, modals, and store banners use `rounded-xl` (24px).
- Small functional tags, urgency pills, and discount indicators utilize a complete pill radius (`rounded-full` / 9999px) to contrast against card perimeters.

## Components

- **Buttons**:
  - *Primary*: Warm persimmon orange (`#EA580C`), white text, font weight 600, `rounded-lg`, with active press state scaling to 98% and deepening to `#C2410C`.
  - *Secondary / Eco-Action*: Forest emerald (`#059669`), white text, reserved for impact actions like "Calculate CO2 Saved" or "Follow Store".
  - *Outline / Ghost*: 1px slate-300 border (`#CBD5E1`), transparent background, slate-800 text; transitions to slate-50 (`#F1F5F9`) background on hover.
- **Cards (Surprise Bag / Listing Card)**:
  - White surface, 1px border (`#E2E8F0`), `rounded-xl` clipping. Features a 16:9 photographic window at the top, overlaid with an absolute-positioned floating discount badge at the top-left and a pickup-time badge at the bottom-left.
  - Body container holds venue title, walking distance, original versus discounted pricing, and an inventory progress indicator.
- **Badges & Chips**:
  - *Discount Badges*: Pill-shaped (`rounded-full`), high-contrast amber background (`#FEF3C7`), dark amber text (`#92400E`), font size 12px, bold uppercase.
  - *Urgency / Countdown*: Bright persimmon tint (`#FFEDD5`), `#9A3412` text, accompanied by a pulsing dot indicating items with fewer than 3 left.
  - *Category Filter Chips*: Soft slate pills (`#F1F5F9`) that flip to emerald (`#059669`) with white text upon selection.
- **Input Fields**:
  - Height 44px, `rounded-lg`, slate-50 background with a 1px border (`#E2E8F0`). On focus, shifts to white fill with a 2px emerald green focus ring (`#10B981`) and zero outer glow.
- **Checkboxes & Radios**:
  - 20px size, `rounded-md` (checkbox) or `rounded-full` (radio). Inactive border slate-300. Active fill emerald (`#059669`) with white check icon.
- **Product-Specific Components**:
  - *Impact Counter*: Visual meter displaying saved CO2 equivalents (kg) and meals rescued using an emerald-to-amber segmented progress bar.
  - *Pickup Time Window Flag*: High-visibility strip with a clock icon displaying exact collection hours (e.g., "Today: 18:30 - 19:00").
