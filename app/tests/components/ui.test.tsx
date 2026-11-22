import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Card, EmptyState, Segmented, Thumb } from "../../src/components/ui";

afterEach(cleanup);

describe("Segmented", () => {
  it("calls onChange with the clicked option's value", async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        options={[
          { value: "models", label: "Models" },
          { value: "guidance", label: "Guidance" },
        ]}
        value="models"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("button", { name: "Models" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Guidance" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "Guidance" }));
    expect(onChange).toHaveBeenCalledWith("guidance");
  });
});

describe("Card", () => {
  it("adds .lift and is keyboard reachable when clickable", async () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick}>clickable</Card>);
    const card = screen.getByRole("button", { name: "clickable" });
    expect(card).toHaveClass("card", "lift");
    await userEvent.click(card);
    card.focus();
    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("has no .lift when static", () => {
    render(<Card className="extra">static</Card>);
    const card = screen.getByText("static");
    expect(card).toHaveClass("card", "extra");
    expect(card).not.toHaveClass("lift");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("Thumb", () => {
  it("renders a lazy image and falls back to an empty frame on error", () => {
    const { container } = render(<Thumb src="/missing.png" alt="sd_tuned 7" />);
    const img = screen.getByRole("img", { name: "sd_tuned 7" });
    expect(img).toHaveAttribute("loading", "lazy");
    fireEvent.error(img);
    expect(screen.queryByRole("img", { name: "sd_tuned 7" })).toBeNull();
    const frame = container.querySelector(".thumb");
    expect(frame).toHaveClass("thumb-empty");
  });

  it("is a button when clickable", async () => {
    const onClick = vi.fn();
    render(<Thumb src="/a.png" alt="a" onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: "a" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("EmptyState", () => {
  it("shows title and optional hint", () => {
    render(<EmptyState title="No images" hint="outputs/milestone_3/images" />);
    expect(screen.getByText("No images")).toBeInTheDocument();
    expect(screen.getByText("outputs/milestone_3/images")).toBeInTheDocument();
  });

  it("renders without a hint", () => {
    const { container } = render(<EmptyState title="Nothing" />);
    expect(container.querySelector(".empty-hint")).toBeNull();
  });
});
