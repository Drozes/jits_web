import * as React from "react";

// Full-bleed breakout: escapes the design layout's `max-w-6xl` <main> container
// so each concept renders at true desktop width. Framed in faux browser chrome
// to read clearly as a desktop screen mock.
export function ConceptFrame({
  url,
  children,
}: {
  url: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        marginLeft: "calc(-50vw + 50%)",
        marginRight: "calc(-50vw + 50%)",
        width: "100vw",
      }}
      className="px-4 sm:px-8"
    >
      <div
        style={{
          border: "1px solid var(--border-hairline-strong)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
          background: "var(--bg-primary)",
        }}
      >
        {/* Faux browser title bar */}
        <div
          className="flex items-center gap-3 px-4"
          style={{
            height: 40,
            background: "var(--bg-secondary)",
            borderBottom: "1px solid var(--border-hairline)",
          }}
        >
          <div className="flex gap-2" aria-hidden>
            {["var(--text-tertiary)", "var(--text-tertiary)", "var(--text-tertiary)"].map(
              (c, i) => (
                <span
                  key={i}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    border: `1px solid ${c}`,
                    opacity: 0.5,
                  }}
                />
              ),
            )}
          </div>
          <div
            className="flex-1 truncate font-mono"
            style={{
              fontSize: "var(--size-num-xs)",
              color: "var(--text-tertiary)",
              letterSpacing: "var(--ls-caps-l)",
              textAlign: "center",
            }}
          >
            {url}
          </div>
          <div style={{ width: 54 }} aria-hidden />
        </div>
        {/* Concept canvas */}
        <div style={{ minHeight: 760, background: "var(--bg-primary)" }}>{children}</div>
      </div>
    </div>
  );
}

// Small section label used across concepts (mono, uppercase metadata).
export function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="font-mono uppercase"
      style={{
        fontSize: "var(--size-num-xs)",
        letterSpacing: "var(--ls-caps-l)",
        color: "var(--text-tertiary)",
        fontWeight: 700,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
