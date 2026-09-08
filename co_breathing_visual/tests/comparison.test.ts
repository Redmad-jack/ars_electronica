import { describe, expect, it, vi } from "vitest";
import { VideoComparison } from "../src/exhibition/comparison";
import { byteRange } from "../scripts/reference-video.mjs";

describe("local video byte ranges", () => {
  it.each([
    [undefined, { start: 0, end: 99 }], ["bytes=0-9", { start: 0, end: 9 }],
    ["bytes=90-", { start: 90, end: 99 }], ["bytes=-10", { start: 90, end: 99 }],
    ["bytes=-200", { start: 0, end: 99 }], ["bytes=90-200", { start: 90, end: 99 }],
    ["bytes=100-", null], ["bytes=10-2", null], ["bytes=-0", null],
    ["bytes=-", null], ["bytes=0-2,5-6", null], ["bad", null],
  ])("parses %s", (header, expected) => expect(byteRange(header as string | undefined, 100)).toEqual(expected));
  it("rejects empty and invalid file sizes", () => {
    for (const size of [0, -1, Infinity, NaN]) expect(byteRange(undefined, size)).toBeNull();
  });
});

function fixture() {
  const video = Object.assign(new EventTarget(), {
    src: "", currentTime: 2, paused: true, ended: false,
    play: vi.fn(async () => { video.paused = false; }),
    pause: vi.fn(() => { video.paused = true; }),
    removeAttribute: vi.fn(), load: vi.fn(),
  });
  const button = { disabled: false, textContent: "" };
  const status = { textContent: "" };
  const hooks = { pause: vi.fn(), reset: vi.fn(), layout: vi.fn() };
  const controller = new VideoComparison(video as unknown as HTMLVideoElement,
    button as HTMLButtonElement, status as HTMLOutputElement, hooks);
  return { video, button, status, hooks, controller };
}

describe("shared video transport", () => {
  it("loads only on request, resets both, and resumes without rewinding", async () => {
    const { video, controller, hooks } = fixture();
    expect(video.src).toBe("");
    await controller.start();
    expect(video.src).toBe("/__local/reference-video");
    expect(video.currentTime).toBe(0);
    expect(hooks.reset).toHaveBeenCalledTimes(1);
    video.currentTime = 3;
    controller.pause();
    video.dispatchEvent(new Event("playing"));
    expect(hooks.pause).toHaveBeenLastCalledWith(true);
    await controller.start(false);
    expect(video.currentTime).toBe(3);
    expect(hooks.reset).toHaveBeenCalledTimes(1);
    expect(hooks.pause).toHaveBeenLastCalledWith(false);
  });
  it("keeps reset paused and freezes on buffering, end and error", async () => {
    const { video, controller, hooks, status } = fixture();
    await controller.start(true, false);
    expect(video.play).not.toHaveBeenCalled();
    expect(hooks.pause).toHaveBeenLastCalledWith(true);
    await controller.start();
    for (const event of ["waiting", "ended", "error"]) {
      video.dispatchEvent(new Event(event));
      expect(hooks.pause).toHaveBeenLastCalledWith(true);
    }
    expect(status.textContent).toContain("视频不可用");
  });
  it("ignores a stale play promise after stop or pause", async () => {
    for (const action of ["stop", "pause"] as const) {
      const { video, controller, hooks, button } = fixture();
      let finish!: () => void;
      video.play.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
      const pending = controller.start();
      expect(button.disabled).toBe(true);
      controller[action]();
      hooks.pause.mockClear();
      finish(); await pending;
      expect(hooks.pause).not.toHaveBeenCalled();
      expect(button.disabled).toBe(false);
    }
  });
  it("keeps simulation paused when browser rejects playback", async () => {
    const { video, controller, hooks, status, button } = fixture();
    video.play.mockRejectedValue(new Error("Unsupported media"));
    await controller.start();
    expect(hooks.pause).toHaveBeenLastCalledWith(true);
    expect(button.disabled).toBe(false);
    expect(status.textContent).toContain("未能播放");
    controller.dispose();
    hooks.pause.mockClear();
    video.dispatchEvent(new Event("waiting"));
    expect(hooks.pause).not.toHaveBeenCalled();
  });
});
