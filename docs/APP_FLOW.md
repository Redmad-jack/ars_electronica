# Co-Breathing v4.0 应用流程

## 1. 上电

1. 两站所有执行器保持关闭，运行时进入 `SAFE_OFF`。
2. 中国 Mac mini、ESP32-S3 与奥地利 Pi 分别自检；未验证硬件关断前仅加载 mock/no-op 适配器。
3. 相机和网络允许独立失败：感知失败不阻止安全状态上报，网络失败不阻止奥地利受限程序退流。
4. 操作员确认后，奥地利开始发布 `AudienceState`；中国开始处理真实鱼并发布 `FlowIntent`。

## 2. 正常闭环

```text
AT camera → person detector/tracker → AudienceState ─┐
                                                     ↓ MQTT
CN camera → fish tracks → FishGroupState → FlowIntent → AT pump field
                              ↑
AudienceState → StimulusIntent → 16-channel vibration field → CN ESP32-S3
```

- 奥地利只发布最多 10 条匿名人物轨迹，不传视频。
- 中国只从真实鱼画面构建 `FishGroupState`，不产生模拟鱼。
- `StimulusIntent` 是中国内部语义，不跨国。
- `AtomizerCommand` 仅来自奥地利本地操作员定时操作。

## 3. 观众容量超限

检测器可观察额外人物，但发布器先保留既有稳定 Track ID，再按互动区、框面积与置信度补足到 10 条，并设置 `capacity_exceeded=true`。模型分辨率和频率不因人数增加。

## 4. 断网和恢复

1. `LIVE_REMOTE` 中超过 2 秒没有新鲜 `FlowIntent`，奥地利切换到 `DEGRADED_LOCAL`。
2. 泵场改用带固定会话种子的平滑程序流，并显示 `procedural_fallback`。
3. 中国端没有新鲜 `AudienceState` 时，震动命令在 2 秒 TTL 后归零。
4. 远端 `FlowIntent` 连续新鲜 10 秒后进入恢复窗口。
5. 以 5 秒交叉渐变从程序流恢复远端流，完成后回到 `LIVE_REMOTE`。

## 5. 安全事件

- 急停、看门狗故障、硬件关断故障、Pi 卡死或 PCA 异常直接进入 `SAFE_OFF`。
- `SAFE_OFF` 的泵、震动和雾化目标全为 0；清除故障需本地明确操作。
- 安全故障不得自动转入 `DEGRADED_LOCAL`。

## 6. 开发者 dry-run

单条命令在无摄像头、网络和执行器时模拟正常闭环、断网退流、稳定恢复、交叉渐变和急停。输出只写标准输出/日志，不接触真实硬件。
