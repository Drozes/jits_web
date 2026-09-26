import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SubmissionFields } from "./submission-fields";

function renderFields() {
  const onFinishTimeChange = vi.fn();
  render(
    <SubmissionFields
      submissionTypes={[]}
      submissionCode=""
      durationSeconds={300}
      onSubmissionChange={vi.fn()}
      onFinishTimeChange={onFinishTimeChange}
    />,
  );
  return onFinishTimeChange;
}

describe("SubmissionFields finish time", () => {
  it("is labelled as required, not optional", () => {
    renderFields();
    expect(screen.queryByText(/optional/i)).toBeNull();
    expect(screen.getByText("Finish Time")).toBeInTheDocument();
  });

  it("reports seconds and flags a time past the match length", () => {
    const onChange = renderFields();
    fireEvent.change(screen.getByPlaceholderText("Min"), { target: { value: "6" } });
    expect(onChange).toHaveBeenLastCalledWith(360);
    expect(screen.getByText("Enter a time between 0:01 and 5:00.")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Min"), { target: { value: "4" } });
    fireEvent.change(screen.getByPlaceholderText("Sec"), { target: { value: "30" } });
    expect(onChange).toHaveBeenLastCalledWith(270);
    expect(screen.queryByText(/Enter a time between/)).toBeNull();
  });

  it("reports undefined when cleared", () => {
    const onChange = renderFields();
    fireEvent.change(screen.getByPlaceholderText("Sec"), { target: { value: "5" } });
    fireEvent.change(screen.getByPlaceholderText("Sec"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});
