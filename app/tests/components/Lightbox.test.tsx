import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Lightbox } from "../../src/components/Lightbox";

const items = [
  { src: "/a.png", alt: "A", title: "Alpha", meta: "CLIP 0.31" },
  { src: "/b.png", alt: "B" },
  { src: "/c.png", alt: "C" },
];

afterEach(cleanup);

function setup(index: number | null) {
  const onClose = vi.fn();
  const onIndex = vi.fn();
  const utils = render(<Lightbox items={items} index={index} onClose={onClose} onIndex={onIndex} />);
  return { onClose, onIndex, ...utils };
}

describe("Lightbox", () => {
  it("renders nothing when index is null", () => {
    setup(null);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders nothing when index is out of range", () => {
    setup(9);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the current item with title and meta", () => {
    setup(0);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "A" })).toHaveAttribute("src", "/a.png");
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("CLIP 0.31")).toBeInTheDocument();
  });

  it("arrow keys change the index, wrapping at the ends", async () => {
    const { onIndex } = setup(1);
    await userEvent.keyboard("{ArrowRight}");
    expect(onIndex).toHaveBeenLastCalledWith(2);
    await userEvent.keyboard("{ArrowLeft}");
    expect(onIndex).toHaveBeenLastCalledWith(0);
  });

  it("wraps from last to first", async () => {
    const { onIndex } = setup(2);
    await userEvent.keyboard("{ArrowRight}");
    expect(onIndex).toHaveBeenLastCalledWith(0);
  });

  it("Escape closes", async () => {
    const { onClose } = setup(0);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on backdrop click but not on image click", () => {
    const { onClose } = setup(0);
    fireEvent.click(screen.getByRole("img", { name: "A" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("lightbox-backdrop"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("moves focus into the dialog and traps Tab", async () => {
    setup(0);
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 6; i++) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await userEvent.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});

describe("Lightbox actions", () => {
  it("renders the actions slot in the dialog, inside the focus trap", async () => {
    const onAct = vi.fn();
    render(
      <Lightbox items={items} index={1} onClose={() => {}} onIndex={() => {}}
        actions={<button type="button" onClick={onAct}>Reuse</button>} />,
    );
    const dialog = screen.getByRole("dialog");
    const btn = screen.getByRole("button", { name: "Reuse" });
    expect(dialog).toContainElement(btn);
    await userEvent.setup().click(btn);
    expect(onAct).toHaveBeenCalledTimes(1);
  });
});
