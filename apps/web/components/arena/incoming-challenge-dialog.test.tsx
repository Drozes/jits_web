import { describe, it, expect, vi, afterEach } from "vitest";
import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { IncomingChallengeDialog, isTypingTarget } from "./incoming-challenge-dialog";

const ana = { challengeId: "c1", challengerId: "a", challengerName: "Ana" };

function Harness({ field }: { field: "button" | "input" | "editable" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {field === "button" && <button type="button">before</button>}
      {field === "input" && <input aria-label="search" />}
      {field === "editable" && (
        <div contentEditable suppressContentEditableWarning aria-label="note">
          x
        </div>
      )}
      <button type="button" onClick={() => setOpen((o) => !o)}>
        flip
      </button>
      {open && (
        <IncomingChallengeDialog
          incoming={ana}
          busy={false}
          onAccept={vi.fn()}
          onDecline={() => setOpen(false)}
        />
      )}
    </>
  );
}

afterEach(() => {
  (document.activeElement as HTMLElement | null)?.blur?.();
});

describe("IncomingChallengeDialog focus", () => {
  it("takes focus, then returns it to the previously focused element on close", () => {
    render(<Harness field="button" />);
    const before = screen.getByRole("button", { name: "before" });
    const flip = screen.getByRole("button", { name: "flip" });
    before.focus();
    // Open without moving focus off "before" (a realtime event, not a click).
    act(() => flip.click());
    const dialog = screen.getByRole("alertdialog", { name: "Ana wants to roll" });
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(before).toHaveFocus();
  });

  it("does not steal focus from a text input the athlete is typing in", () => {
    render(<Harness field="input" />);
    const input = screen.getByRole("textbox", { name: "search" });
    input.focus();
    act(() => screen.getByRole("button", { name: "flip" }).click());
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it("recognises typing targets", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const child = document.createElement("span");
    editable.appendChild(child);
    const off = document.createElement("div");
    off.setAttribute("contenteditable", "false");
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(textarea)).toBe(true);
    expect(isTypingTarget(select)).toBe(true);
    expect(isTypingTarget(editable)).toBe(true);
    expect(isTypingTarget(child)).toBe(true);
    expect(isTypingTarget(off)).toBe(false);
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
