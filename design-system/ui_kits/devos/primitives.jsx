/* global React */
// DevOS UI Kit — shared primitives.
// All components below are exported to window so other Babel scripts can read them.

const { useState, useEffect, useRef } = React;

/* ---------------- Card ---------------- */
function Card({ children, accent, style, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--surface)",
        border: "0.5px solid var(--border)",
        borderLeft: accent ? `3px solid ${accent}` : undefined,
        borderRadius: accent ? "0 var(--radius) var(--radius) 0" : "var(--radius)",
        padding: "10px 14px",
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ---------------- Tag ---------------- */
function Tag({ variant = "gray", children }) {
  return <span className={`tag tag-${variant}`}>{children}</span>;
}

/* ---------------- Eyebrow ---------------- */
function Eyebrow({ children, style }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 500,
        color: "var(--muted)",
        textTransform: "uppercase",
        letterSpacing: ".05em",
        marginBottom: 6,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ---------------- StatTile ---------------- */
function StatTile({ label, value, color }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "10px 12px",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 500, color: color || "var(--text)" }}>{value}</div>
    </div>
  );
}

/* ---------------- Button ---------------- */
function Button({ variant, children, style, ...rest }) {
  const base = {
    cursor: "pointer",
    border: "0.5px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    borderRadius: "var(--radius)",
    padding: "6px 12px",
    fontSize: 12,
    fontFamily: "inherit",
    transition: "background .12s",
  };
  const variants = {
    primary: { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" },
    danger:  { background: "var(--danger)", color: "#fff", borderColor: "var(--danger)" },
  };
  return (
    <button {...rest} style={{ ...base, ...(variants[variant] || {}), ...style }}>
      {children}
    </button>
  );
}

/* ---------------- Input ---------------- */
function Input({ style, ...rest }) {
  return (
    <input
      {...rest}
      style={{
        border: "0.5px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "8px 12px",
        fontSize: 13,
        width: "100%",
        background: "var(--surface)",
        color: "var(--text)",
        fontFamily: "inherit",
        ...style,
      }}
    />
  );
}

/* ---------------- Dot ---------------- */
function Dot({ color = "var(--success)", size = 7, style }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

/* ---------------- SectionHeader ---------------- */
function SectionHeader({ label, right }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16,
      }}
    >
      <h2 style={{ fontSize: 16, fontWeight: 500 }}>{label}</h2>
      {right}
    </div>
  );
}

Object.assign(window, { Card, Tag, Eyebrow, StatTile, Button, Input, Dot, SectionHeader });
