# 002 — Styling Guide

**Source:** `outside_assets/FigmaMakeDemo/src/styles/globals.css`
**Date:** 2026-02-13
**Scope:** Color tokens, typography, layout conventions, and animations to adopt from the Figma Make export — with migration notes for the existing codebase.

---

## Migration Context

The current `app/globals.css` uses **shadcn/ui defaults** — grayscale HSL tokens wrapped via `hsl(var(--...))` in the Tailwind config. The Figma export uses **raw hex values** with a branded red palette.

**Migration path:** Convert Figma hex values to HSL and drop them into the existing CSS variable slots. The `hsl(var(--...))` wrapper pattern in `tailwind.config.ts` stays unchanged.

---

## 1. Color Tokens

### Light Mode (`:root`)

| Token | Current (HSL) | Target (HSL) | Hex | Role |
|-------|---------------|--------------|-----|------|
| `--primary` | `0 0% 9%` | `0 93% 43%` | `#d20a0a` | Brand red — buttons, active states, ring |
| `--primary-foreground` | `0 0% 98%` | `0 0% 100%` | `#ffffff` | Text on primary |
| `--background` | `0 0% 100%` | `210 17% 97%` | `#f8f9fa` | Page background |
| `--foreground` | `0 0% 3.9%` | `0 0% 10%` | `#1a1a1a` | Primary text |
| `--card` | `0 0% 100%` | `0 0% 100%` | `#ffffff` | Card surfaces (unchanged) |
| `--card-foreground` | `0 0% 3.9%` | `0 0% 10%` | `#1a1a1a` | Card text |
| `--secondary` | `0 0% 96.1%` | `210 16% 95%` | `#f1f3f5` | Secondary backgrounds |
| `--secondary-foreground` | `0 0% 9%` | `0 0% 10%` | `#1a1a1a` | Secondary text |
| `--muted` | `0 0% 96.1%` | `210 12% 92%` | `#e9ecef` | Subtle backgrounds |
| `--muted-foreground` | `0 0% 45.1%` | `210 7% 46%` | `#6c757d` | De-emphasized text |
| `--accent` | `0 0% 96.1%` | `0 93% 43%` | `#d20a0a` | Matches primary (intentional) |
| `--accent-foreground` | `0 0% 9%` | `0 0% 100%` | `#ffffff` | Text on accent |
| `--destructive` | `0 84.2% 60.2%` | `0 84% 50%` | `#dc2626` | Danger actions |
| `--destructive-foreground` | `0 0% 98%` | `0 0% 100%` | `#ffffff` | Text on destructive |
| `--border` | `0 0% 89.8%` | `0 0% 0% / 0.08` | `rgba(0,0,0,0.08)` | Subtle borders (see note below) |
| `--input` | `0 0% 89.8%` | `0 0% 0% / 0` | `transparent` | Input borders |
| `--ring` | `0 0% 3.9%` | `0 93% 43%` | `#d20a0a` | Focus ring (matches primary) |

**Border alpha handling:** The `hsl()` function supports the `/alpha` syntax: `hsl(0 0% 0% / 0.08)`. This works with the existing Tailwind `hsl(var(--border))` wrapper. No config change needed.

### Dark Mode (`.dark`)

| Token | Target (HSL) | Hex |
|-------|-------------|-----|
| `--background` | `0 0% 4%` | `#0a0a0a` |
| `--foreground` | `0 0% 100%` | `#ffffff` |
| `--card` | `0 0% 8%` | `#151515` |
| `--card-foreground` | `0 0% 100%` | `#ffffff` |
| `--secondary` | `0 0% 10%` | `#1a1a1a` |
| `--secondary-foreground` | `0 0% 100%` | `#ffffff` |
| `--muted` | `0 0% 16%` | `#2a2a2a` |
| `--muted-foreground` | `0 0% 63%` | `#a1a1a1` |
| `--primary` | `0 93% 43%` | `#d20a0a` (same as light) |
| `--accent` | `0 93% 43%` | `#d20a0a` (same as light) |
| `--destructive` | `0 84% 60%` | `#ef4444` |
| `--border` | `0 0% 100% / 0.1` | `rgba(255,255,255,0.1)` |
| `--input` | `0 0% 4%` | `#0a0a0a` |
| `--ring` | `0 93% 43%` | `#d20a0a` |

### Chart Colors

| Token | Light | Dark |
|-------|-------|------|
| `--chart-1` | `0 93% 43%` | `0 93% 43%` |
| `--chart-2` | `0 0% 10%` | `0 0% 100%` |
| `--chart-3` | `0 0% 46%` | `0 0% 40%` |
| `--chart-4` | `0 84% 60%` | `0 84% 60%` |
| `--chart-5` | `0 79% 35%` | `0 79% 35%` |

### Extended Brand Colors

Add to `:root` (and `.dark` — these don't change between themes):

```css
--brand-gold: 38 92% 50%;     /* #f59e0b — streak/achievement accents */
--brand-orange: 25 95% 53%;   /* #f97316 — fire/energy accents */
--brand-deep-red: 0 84% 50%;  /* #dc2626 — intense red variant */
```

Register in `tailwind.config.ts` under `theme.extend.colors`:

```ts
gold: "hsl(var(--brand-gold))",
"brand-orange": "hsl(var(--brand-orange))",
"deep-red": "hsl(var(--brand-deep-red))",
```

---

## 2. Typography

### Font Stack

```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
```

Use `next/font/google` to load Inter. The system fallback stack is standard.

### Scale

Map to existing Tailwind utilities — no custom sizes needed:

| Role | Tailwind Class | Extra |
|------|---------------|-------|
| H1 | `text-2xl font-bold` | `uppercase tracking-tight` |
| H2 | `text-xl font-bold` | `tracking-tight` |
| H3 | `text-lg font-bold` | — |
| H4 / Labels | `text-base font-bold` | — |
| Body | `text-base font-medium` | — |
| Buttons | `text-base font-bold` | `uppercase tracking-wide` |
| Small | `text-xs` | — |
| Athletic numbers | `text-3xl font-black` | `tracking-tight leading-none` |

### Conventions

- **Buttons:** Always `uppercase tracking-wide`
- **Headings:** `tracking-tight`
- **Body:** Tailwind default tracking is fine (the Figma `-0.01em` is imperceptible)

---

## 3. Layout Conventions

### Mobile-First Container

All app content renders in a centered mobile column. Apply in `(app)/layout.tsx`:

```
max-w-md mx-auto px-4 pb-20
```

`max-w-md` = 448px max. `pb-20` clears the fixed bottom nav.

### Spacing

Use Tailwind defaults consistently:

| Context | Class |
|---------|-------|
| Page padding | `px-4` |
| Section gaps | `space-y-6` |
| Card padding | `p-4` |
| List item gaps | `gap-3` |
| Icon-to-text | `gap-2` |

### Card Pattern

Standard card:

```
rounded-lg border bg-card p-4 shadow-sm
```

Interactive card (add hover via CVA variant, not inline repetition):

```
hover:border-primary/20 hover:shadow-md hover:-translate-y-0.5 transition-all
```

Define this as a CVA variant on the `<Card>` component (e.g., `variant="interactive"`) rather than repeating the class string across files.

---

## 4. Animations

### Adopt Now

Add keyframes to `app/globals.css`:

```css
@keyframes fade-in-up {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

@keyframes pulse-red {
  0%, 100% { box-shadow: 0 0 0 0 hsl(var(--primary) / 0.4); }
  50% { box-shadow: 0 0 0 8px hsl(var(--primary) / 0); }
}
```

Register in `tailwind.config.ts` under `theme.extend`:

```ts
keyframes: {
  "fade-in-up": {
    from: { transform: "translateY(20px)", opacity: "0" },
    to: { transform: "translateY(0)", opacity: "1" },
  },
  "pulse-red": {
    "0%, 100%": { boxShadow: "0 0 0 0 hsl(var(--primary) / 0.4)" },
    "50%": { boxShadow: "0 0 0 8px hsl(var(--primary) / 0)" },
  },
},
animation: {
  "fade-in-up": "fade-in-up 0.6s ease-out",
  "pulse-red": "pulse-red 2s infinite",
},
```

| Animation | Usage |
|-----------|-------|
| `animate-fade-in-up` | List items, card entrances, page content |
| `animate-pulse-red` | "Awaiting response" status, live match indicator |

### Defer (add when the feature ships)

| Animation | Feature |
|-----------|---------|
| `glow-pulse` | Leaderboard champion highlight |
| `fire-pulse` | Win streak indicator |
| `slide-in-left/right` | Landing page hero (excluded from scope) |
| `stripe-slide` | Landing page decoration (excluded from scope) |
| `gradient` | Landing page cards (excluded from scope) |

---

## 5. Gradients

### Adopt as Tailwind Plugin (token-aware)

All gradients must reference CSS variables, not hardcoded hex. This ensures dark mode and theme changes propagate automatically.

Add to `app/globals.css`:

```css
@layer utilities {
  .bg-gradient-primary {
    background: linear-gradient(
      135deg,
      hsl(var(--primary)) 0%,
      hsl(var(--primary) / 0.7) 100%
    );
  }

  .bg-gradient-intense {
    background: linear-gradient(
      135deg,
      hsl(var(--brand-deep-red)) 0%,
      hsl(var(--primary)) 50%,
      hsl(var(--brand-deep-red) / 0.8) 100%
    );
  }
}
```

### Skip

All other Figma gradients (`.fire-gradient`, `.logo-accent-gradient`, `.light-gradient-bg`) are landing-page-only — excluded from scope.

---

## 6. Custom CSS Classes — Do Not Port

The Figma export contains many custom CSS classes. **None of them should be copied into the codebase.** Here's why and what to do instead:

| Figma Class | Replacement |
|-------------|-------------|
| `.fight-card` | CVA variant on `<Card>` (`variant="interactive"`) |
| `.premium-card` | Same — just the base `<Card>` with `shadow-sm` |
| `.stat-bar` | `<Progress />` shadcn component |
| `.athletic-number` | Tailwind: `text-3xl font-black tracking-tight leading-none` |
| `.subtle-red-glow` | Tailwind: `shadow-[0_2px_12px_hsl(var(--primary)/0.15)]` |
| `.octagon-pattern` | Defer — build as component background if leaderboard needs it |
| `.diagonal-stripes` | Landing page only — excluded |
| `.corner-ribbon` | Build as part of `<MatchCard>` when live matches ship |
| `.champion-glow` | Defer — build as `<EloBadge>` variant when leaderboard ships |
| `.knockout-text` | Tailwind: `font-black uppercase bg-clip-text text-transparent bg-gradient-primary` |
| `.versus-divider` / `.versus-text` | Part of `<VersusDisplay>` component — not a utility class |

**Principle:** Prefer Tailwind utilities and CVA variants over custom CSS classes. Custom CSS is only justified for animations (keyframes) and gradients that can't be expressed in Tailwind's utility syntax.

---

## Summary: Migration Checklist

1. **Swap CSS variables** in `app/globals.css` — replace all HSL values with the target values from Section 1 (both `:root` and `.dark`)
2. **Add brand tokens** (`--brand-gold`, `--brand-orange`, `--brand-deep-red`) to `:root`
3. **Register brand colors** in `tailwind.config.ts` (`gold`, `brand-orange`, `deep-red`)
4. **Add keyframes** (`fade-in-up`, `pulse-red`) to `globals.css` and `tailwind.config.ts`
5. **Add gradient utilities** (`bg-gradient-primary`, `bg-gradient-intense`) to `globals.css`
6. **Do not port** any Figma custom CSS classes — use Tailwind utilities and CVA variants instead
