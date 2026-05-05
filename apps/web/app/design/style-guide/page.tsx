const coreColors = [
  { name: "Background", var: "--background", label: "Page base" },
  { name: "Foreground", var: "--foreground", label: "Primary text" },
  { name: "Card", var: "--card", label: "Elevated surfaces" },
  { name: "Secondary", var: "--secondary", label: "Subtle fills" },
  { name: "Muted", var: "--muted", label: "Disabled / inactive" },
  { name: "Muted Foreground", var: "--muted-foreground", label: "Tertiary text" },
  { name: "Border", var: "--border", label: "Dividers, outlines" },
];

const brandColors = [
  { name: "Signal Red", var: "--primary", label: "CTAs, destructive" },
  { name: "Brand Gold", var: "--brand-gold", label: "Accent highlights" },
  { name: "Brand Orange", var: "--brand-orange", label: "Warm accent" },
  { name: "Deep Red", var: "--brand-deep-red", label: "Darker brand tone" },
];

const semanticColors = [
  { name: "Success / Gain Green", var: "--success", label: "Rating increases only" },
  { name: "Primary", var: "--primary", label: "Signal Red CTAs" },
];

const fonts = [
  {
    family: "Bebas Neue",
    cssVar: "--font-display",
    twClass: "font-display",
    usage: "Display text, wordmarks, taglines. All caps, tight line-height (0.85).",
    specimen: "THE ARENA AWAITS",
  },
  {
    family: "DM Sans Bold",
    cssVar: "--font-heading",
    twClass: "font-heading",
    usage: "Headings, UI labels, button text. Uppercase for labels with letter-spacing 0.08em+.",
    specimen: "MATCH RESULTS",
  },
  {
    family: "Inter",
    cssVar: "--font-body",
    twClass: "font-body",
    usage: "Body text, prose, descriptions. Default body font.",
    specimen: "The quick brown fox jumps over the lazy dog.",
  },
  {
    family: "JetBrains Mono",
    cssVar: "--font-mono",
    twClass: "font-mono",
    usage: "ALL numeric data: ratings, deltas, rank badges, metadata. Always use tabular-nums.",
    specimen: "1247 (+12) #3",
  },
];

const spacingScale = [4, 8, 12, 16, 24, 32, 48, 64, 96];

const motionRules = [
  { name: "Rating tick", duration: "480ms", easing: "ease-out", note: "Auto-animated on load" },
  { name: "Hover / focus", duration: "100ms", easing: "ease-out", note: "Reactive only" },
  { name: "Fades", duration: "240ms", easing: "ease-out (enter), ease-in (exit)", note: "Overlays, toasts" },
  { name: "LIVE pulse", duration: "1400ms loop", easing: "ease-in-out", note: "Match in progress indicator" },
];

const antiPatterns = [
  "No drop shadows. Use background-color shifts (Void, Panel, Plate, Plate Bright) for hierarchy.",
  "No decorative gradients. Flat fills only.",
  "No rounded pills (except avatars, which stay circular).",
  "No decorative color. Signal Red for CTAs only. Gain Green for rating increases only.",
  "One primary CTA per surface. Never stack two red buttons.",
  "No ornamental borders. Borders serve as dividers, not decoration.",
  "No parallax or scroll-hijacking effects.",
  "No card elevation via shadow. Differentiate with bg shifts and border.",
];

const sizeScale = ["text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-2xl", "text-3xl", "text-4xl"];

function Swatch({ name, cssVar, label }: { name: string; cssVar: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-12 w-12 shrink-0 rounded-sm border border-border"
        style={{ backgroundColor: `hsl(var(${cssVar}))` }}
      />
      <div>
        <p className="font-heading text-sm font-bold uppercase tracking-wide text-foreground">{name}</p>
        <p className="font-mono text-xs text-muted-foreground">var({cssVar})</p>
        <p className="font-body text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function colorToSwatchProps(c: { name: string; var: string; label: string }) {
  return { name: c.name, cssVar: c.var, label: c.label };
}

export default function StyleGuidePage() {
  return (
    <div className="space-y-16">
      <section className="space-y-3 pt-4">
        <h1 className="font-display text-5xl uppercase leading-none text-foreground">Style Guide</h1>
        <p className="max-w-2xl font-body text-muted-foreground">
          Brand identity tokens, typography, spacing, motion, and design constraints for ELO RATED.
        </p>
      </section>

      {/* 1. Color Palette */}
      <section className="space-y-8">
        <h2 className="font-display text-3xl uppercase leading-none text-foreground">Color Palette</h2>

        <div className="space-y-4">
          <h3 className="font-heading text-sm uppercase tracking-widest text-muted-foreground">Core</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{coreColors.map((c) => <Swatch key={c.var + c.name} {...colorToSwatchProps(c)} />)}</div>
        </div>

        <div className="space-y-4">
          <h3 className="font-heading text-sm uppercase tracking-widest text-muted-foreground">Brand Accents</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{brandColors.map((c) => <Swatch key={c.var + c.name} {...colorToSwatchProps(c)} />)}</div>
        </div>

        <div className="space-y-4">
          <h3 className="font-heading text-sm uppercase tracking-widest text-muted-foreground">Semantic</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{semanticColors.map((c) => <Swatch key={c.var + c.name} {...colorToSwatchProps(c)} />)}</div>
        </div>
      </section>

      {/* 2. Typography */}
      <section className="space-y-8">
        <h2 className="font-display text-3xl uppercase leading-none text-foreground">Typography</h2>

        <div className="space-y-6">
          {fonts.map((f) => (
            <div key={f.family} className="space-y-2 rounded-sm border border-border bg-card p-5">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h3 className="font-heading text-base font-bold uppercase tracking-wide text-foreground">{f.family}</h3>
                <span className="font-mono text-xs text-muted-foreground">var({f.cssVar})</span>
                <code className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">.{f.twClass}</code>
              </div>
              <p className="font-body text-sm text-muted-foreground">{f.usage}</p>
              <p className={`${f.twClass} text-2xl text-foreground ${f.twClass === "font-display" ? "uppercase leading-none" : ""} ${f.twClass === "font-heading" ? "uppercase tracking-wide" : ""} ${f.twClass === "font-mono" ? "tabular-nums" : ""}`}>
                {f.specimen}
              </p>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <h3 className="font-heading text-sm uppercase tracking-widest text-muted-foreground">Size Scale</h3>
          <div className="space-y-2 rounded-sm border border-border bg-card p-5">
            {sizeScale.map((size) => (
              <div key={size} className="flex items-baseline gap-4">
                <code className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{size}</code>
                <p className={`${size} font-body text-foreground`}>The quick brown fox</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Spacing & Radius */}
      <section className="space-y-8">
        <h2 className="font-display text-3xl uppercase leading-none text-foreground">Spacing &amp; Radius</h2>

        <div className="space-y-4">
          <h3 className="font-heading text-sm uppercase tracking-widest text-muted-foreground">Spacing Scale (4px increments)</h3>
          <div className="space-y-2">
            {spacingScale.map((px) => (
              <div key={px} className="flex items-center gap-4">
                <code className="w-16 shrink-0 text-right font-mono text-xs text-muted-foreground">{px}px</code>
                <div className="h-4 rounded-sm bg-primary" style={{ width: `${px}px` }} />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-heading text-sm uppercase tracking-widest text-muted-foreground">Border Radius</h3>
          <div className="flex flex-wrap gap-6">
            <div className="space-y-2 text-center">
              <div className="mx-auto h-16 w-24 border border-border bg-card" style={{ borderRadius: "4px" }} />
              <p className="font-mono text-xs text-muted-foreground">4px default</p>
            </div>
            <div className="space-y-2 text-center">
              <div className="mx-auto h-16 w-24 border border-border bg-card" style={{ borderRadius: "8px" }} />
              <p className="font-mono text-xs text-muted-foreground">8px modal</p>
            </div>
            <div className="space-y-2 text-center">
              <div className="mx-auto h-16 w-16 rounded-full border border-border bg-card" />
              <p className="font-mono text-xs text-muted-foreground">Circular avatar</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Motion */}
      <section className="space-y-6">
        <h2 className="font-display text-3xl uppercase leading-none text-foreground">Motion</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-2 pr-4 font-heading text-xs uppercase tracking-widest text-muted-foreground">Element</th>
                <th className="pb-2 pr-4 font-heading text-xs uppercase tracking-widest text-muted-foreground">Duration</th>
                <th className="pb-2 pr-4 font-heading text-xs uppercase tracking-widest text-muted-foreground">Easing</th>
                <th className="pb-2 font-heading text-xs uppercase tracking-widest text-muted-foreground">Note</th>
              </tr>
            </thead>
            <tbody>
              {motionRules.map((r) => (
                <tr key={r.name} className="border-b border-border/50">
                  <td className="py-2.5 pr-4 font-body text-sm text-foreground">{r.name}</td>
                  <td className="py-2.5 pr-4 font-mono text-sm tabular-nums text-foreground">{r.duration}</td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground">{r.easing}</td>
                  <td className="py-2.5 font-body text-sm text-muted-foreground">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. Anti-Patterns */}
      <section className="space-y-6">
        <h2 className="font-display text-3xl uppercase leading-none text-foreground">Anti-Patterns</h2>
        <p className="font-body text-sm text-muted-foreground">
          These rules keep the visual language tight. Every exception weakens brand recognition.
        </p>
        <ol className="space-y-3">
          {antiPatterns.map((rule, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-primary/10 font-mono text-xs text-primary">
                {i + 1}
              </span>
              <p className="font-body text-sm text-foreground">{rule}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
