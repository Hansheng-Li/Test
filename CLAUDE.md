# SUNSET SYNDICATE · 项目说明（给 AI 助手与新协作者）

浏览器第一人称"手工 → 自动化"犯罪经营模拟，背景为虚构的 1996 年佛罗里达城市 Sol Palma。所有产品、商家、人物均为虚构。

## 命令

```bash
npm install          # 首次
npm run dev          # Vite 开发服务器 http://127.0.0.1:5173
npm run build        # 产物在 dist/
npx tsc --noEmit     # 类型检查（提交前必跑）
npx vitest run       # 单测（tests/*.test.ts，纯逻辑系统）
npx playwright test  # e2e（e2e/*.spec.ts，需要 dev 服务器；Chromium 在 /opt/pw-browsers/chromium）
```

## 架构一览

- `src/game/Game.ts`：唯一的编排者（tick 循环、交互接线、面板、过场、电台开关、存档）。实现 `GameAPI` 供 UI 调用。
- `src/game/GameState.ts`：可序列化状态；`SAVE_VERSION` 变更时在 `SaveSystem.deserialize` 里写迁移。
- `src/systems/*.ts`：**纯函数**逻辑（库存、经济、生产、顾客、订单、热度、跑腿、工人、经销商、事件、里程碑、存档修复）。不碰 DOM/Three，所有单测针对这里。
- `src/data/*.ts`：城市布局、物品/商店、产品化学、顾客定义。电台文案里出现的商家必须存在于 `city.ts`。
- `src/world/*`：城市生成、静态合并（`StaticMerge`）、Kenney 模型加载（`Models.ts`，缺文件回退方块）、天气、昼夜。
- `src/entities/*`：NPC 状态机（市民、警察 7 态、顾客、游荡顾客、跑腿）。
- `src/audio/*`：程序化音效 + CC0 采样（缺文件回退合成音）、四频道电台（`Radio.ts`）、合成器电台（`SynthLoop.ts`）。
- `src/ui/*`：DOM/CSS HUD 与面板。玩家输入的文字进入 `innerHTML` 前必须经 `esc()`。
- `public/assets/`：仅 CC0 素材，逐文件记录在 `public/assets/LICENSES.md`；游戏在这些文件缺失时必须仍可运行。

## 约定

- import 全部放在文件顶部；新逻辑优先写成纯函数放进 `systems/` 并配单测；不写无意义的测试。
- 提交信息、代码注释、PR 里不出现模型标识。每个小功能验证通过后即 add/commit/push。
- 不虚构游戏里不存在的机制、地点或数字（字幕、电台、提示文案都要对得上数据文件）。
- 生成的说明文档放 `cursor_md_folder/`（已 gitignore，用中文）；README 用英文。

## 验证方式（重要）

- 无头 Chromium 只有约 4 fps；物理 dt 上限 0.05，因此脚本要按帧等待（`requestAnimationFrame` 计数），UI 计时用未封顶的 `uiDt`。
- 浏览器脚本运行期间不要改 `src/`：Vite HMR 会整页重载并打断脚本。
- `window.game` 在页面上暴露了 `Game` 实例，脚本可直接调用其方法/读取状态（e2e 与 scratchpad 脚本都这么做）。
- 回归手段：Vitest、6 条 e2e、混沌脚本（异常操作序列）、猴子测试（随机操作 + 状态不变量）、经济 soak、内存 soak、`perf` 脚本（draw call / 三角形）。改动系统数值后至少跑单测 + e2e，改动渲染后跑 perf。
