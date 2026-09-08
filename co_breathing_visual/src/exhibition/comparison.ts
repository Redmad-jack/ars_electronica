interface ComparisonHooks {
  pause(value: boolean): void;
  reset(): void;
  layout(active: boolean): void;
}

/** Video is the transport clock; the simulation samples its time without seeking the movie. */
export class VideoComparison {
  active = false;
  private generation = 0;
  private pending = false;
  private objectUrl: string | undefined;
  private readonly listeners: Array<[string, () => void]> = [];

  constructor(readonly video: HTMLVideoElement, private readonly playButton: HTMLButtonElement,
    private readonly status: HTMLOutputElement, private readonly hooks: ComparisonHooks) {
    this.on("waiting", () => { if (this.active) { hooks.pause(true); this.message("视频缓冲中，两边等待…"); } });
    this.on("playing", () => { if (this.active && !this.pending && !video.paused && !video.ended) { hooks.pause(false); this.message("同步播放中 · 空格暂停，R 重播"); } });
    this.on("ended", () => { if (this.active) { hooks.pause(true); this.message("播放结束 · 点击同步播放可重播"); } });
    this.on("error", () => {
      if (!this.active) return;
      this.generation += 1; this.pending = false; video.pause(); hooks.pause(true); this.refresh();
      this.message("视频不可用或格式不支持。请选择本地视频；必要时改用 H.264 MP4。");
    });
  }

  private on(event: string, callback: () => void): void {
    this.listeners.push([event, callback]); this.video.addEventListener(event, callback);
  }
  private message(text: string): void { this.status.textContent = text; }
  private refresh(): void {
    this.playButton.disabled = this.pending;
    this.playButton.textContent = this.pending ? "正在加载视频…" : this.active ? "从头同步播放" : "▶ 同步播放视频 + 模拟";
  }

  async start(rewind = true, play = true): Promise<void> {
    const generation = ++this.generation;
    this.pending = true; this.active = true;
    this.hooks.pause(true); this.hooks.layout(true); this.refresh();
    if (rewind) { this.video.pause(); this.hooks.reset(); }
    if (!this.video.src) this.video.src = "/__local/reference-video";
    if (rewind) this.video.currentTime = 0;
    if (!play) { this.pending = false; this.refresh(); this.message("已同步重置 · 空格继续"); return; }
    this.message("正在加载视频，两边从头准备…");
    try {
      await this.video.play();
      if (generation !== this.generation || !this.active) return;
      this.pending = false; this.hooks.pause(false); this.refresh();
      this.message("同步播放中 · 空格暂停，R 重播");
    } catch {
      if (generation !== this.generation) return;
      this.pending = false; this.hooks.pause(true); this.refresh();
      this.message("未能播放。请检查视频路径／格式，或用“选择视频”重新打开。");
    }
  }

  pause(): void {
    this.generation += 1; this.pending = false; this.video.pause(); this.hooks.pause(true); this.refresh();
    this.message("两边已暂停 · 空格继续");
  }
  resume(): void { void this.start(this.video.ended, true); }
  stop(): void {
    this.generation += 1; this.pending = false; this.active = false;
    this.video.pause(); this.hooks.layout(false); this.hooks.pause(false); this.refresh();
    this.message("已返回单独模拟展示");
  }
  choose(file: File): void {
    this.stop(); this.video.removeAttribute("src"); this.video.load();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file); this.video.src = this.objectUrl;
    this.message(`已选择 ${file.name} · 点击同步播放`);
  }
  dispose(): void {
    this.generation += 1; this.active = false;
    for (const [event, callback] of this.listeners) this.video.removeEventListener(event, callback);
    this.video.pause(); this.video.removeAttribute("src"); this.video.load();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
  }
}
