# Co-Breathing v4.0 后端结构

## 1. 渐进拆分原则

保留现有已通过测试的单机原型模块，不在 P0 删除或重写。新架构在同一 Python 包内增加清晰边界，待契约和闭环稳定后再决定迁移旧代码。

```text
co_breathing/src/co_breathing/
├── shared/        # 契约、JSON、模式、TTL/序列/数值验证
├── china/         # 真实鱼聚合、震动意图、水流意图
├── austria/       # 人体轨迹状态、容量选择、泵场、程序退流
├── tools/         # 双站 dry-run、消息验证、性能基准
├── actuators/     # 旧原型驱动，P0 不接入 v4 真实输出
├── vision/        # 旧视觉原型，后续由适配器渐进复用
└── runtime.py     # 旧单机 runtime，保留兼容
```

## 2. 依赖方向

```text
shared ← china
shared ← austria
shared/china/austria ← tools
```

- `shared` 不依赖站点模块或硬件库。
- 中国和奥地利纯映射不依赖 MQTT、串口、GPIO 或 OpenCV。
- 传输和硬件以后通过端口适配器接入，不允许网络 payload 直达执行器。

## 3. 核心组件

### `shared`

- `Envelope`：版本、类型、ID、序列、源站点/设备、UTC 时间、TTL、payload。
- 状态/命令 dataclass：统一范围和有限数验证、JSON 字典转换。
- `RunMode`：`SAFE_OFF`、`LIVE_REMOTE`、`DEGRADED_LOCAL`。

### `china`

- `FishGroupAggregator`：从 3–5 条真实鱼轨迹聚合群体状态。
- `ChinaVibrationController`：观众输入 TTL、安全锁存和 16 路归零裁决。
- `audience_to_stimulus`：观众轨迹到本地刺激语义。
- `stimulus_to_vibration`：刺激语义到 4×4、16 路目标。
- `fish_group_to_flow`：真实鱼群状态到跨国 `FlowIntent`。

### `austria`

- `LatestMjpegFrameSource`：持续排空 ESP32 MJPEG，只保留最新帧；过期时停止发布，超过强制窗口后请求重建连接，并支持操作员手动重连。
- `HailoPersonTracker`：Hailo-8 上的 YOLOv8s HEF person-only 检测，使用 RGB letterbox 预处理，后接 ByteTrack。
- `CpuPersonTracker`：YOLOv8n NCNN person-only 检测与 ByteTrack，输出最多 20 个候选供容量判断。
- `AudienceStateBuilder`：根据带 Track ID 的检测结果计算速度和 activity EMA，稳定选择最多 10 条。
- `VisionDiagnosticsLogger`：保存窗口采集/推理频率、帧龄、帧间隔、推理耗时和连接故障计数，不保存原始画面。
- `FlowController`：校验后的远端意图、2 秒超时、10 秒稳定恢复、5 秒交叉渐变和 `SAFE_OFF`。
- `ProceduralFlow`：固定种子的平滑、限幅程序水流。
- `flow_to_pumps`：语义流到 3–9 路泵场。

## 4. P0 运行边界

P0 工具在一个进程内实例化两个站点，使用内存消息和 no-op 输出验证业务链。Phase 1 已增加奥地利 ESP32 MJPEG + Hailo/ByteTrack 正式后端和 CPU NCNN 退格；真实 MQTT、USB Serial、ESP32 固件及 GPIO/PCA 适配器仍属于后续里程碑。

## 5. 历史目录

`maps_network/` 是旧工作区目录，不是 Git 分支，不参与 v4 运行、导入或模型路径解析。其根 README 可作为历史说明，其余内容由根 `.gitignore` 隔离。
