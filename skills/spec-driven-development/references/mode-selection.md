# Mode Selection: Quick Fix vs Spec

本 skill 支援兩條開發路徑。**任何**寫 / 改 code 的工作都應該走其中一條，不要繞過去直接動手 — 兩條路徑都強制走 multi-round review loop，這是品質防線。

| | Quick Fix Mode | Spec Mode |
|---|---|---|
| 文件產出 | 無（plan mode 對話取代）| requirements.md + design.md + tasks.md |
| 動手者 | 主 agent 直接動手 | `spec-implementer` agents |
| design-reviewer loop | **強制**（對 plan 內容多輪審到 0 issues） | **強制**（對 design.md 多輪審到 0 issues） |
| implementation-reviewer loop | **強制**（多輪審到 0 issues） | **強制**（多輪審到 0 issues） |
| 適用情境 | bug fix / refactor / 小擴展 | 新功能 / 大型 refactor / 跨多元件 |

兩條路徑共享 multi-round review loop 紀律 — 完整協定見 `review-protocol.md`。

---

## 判斷標準

### 走 Quick Fix Mode 的情境

- **修 bug**：包含單行 fix、邏輯錯誤、邊界條件、race condition
- **重構**：行為不變的程式碼結構調整（rename / extract / inline / move）
- **既有架構內的小擴展**：在現有元件上加一個小 feature（不引入新概念）
- **改 config / 文件 / typo**：純文字 / 設定修改
- **效能微調**：在既有 hot path 上做局部優化

關鍵特徵：
- 不需要新建 component / data model / API
- 改動範圍可控（通常 < 5 個檔案）
- user 對需求理解清楚，不需要正式的 requirements / acceptance criteria

### 走 Spec Mode 的情境

- **新功能**：引入新 component / data model / API endpoint / 流程
- **大型 refactor**：架構層級調整（拆 module / 重組責任邊界）
- **跨多元件協作**：改動需要同步動到 3+ 個元件
- **引入新概念**：對 codebase 加入未曾出現過的設計 pattern / 抽象
- **需要 user 對齊需求**：功能目標還需要在 requirements 層級先談清楚

關鍵特徵：
- 需要正式 design 文件來追溯「為什麼這樣設計」
- 改動範圍大或不確定
- 可能跨 multiple PR / 多次 session 才能完成

---

## 模糊情境的處理

很多任務介於兩者之間。處理原則：

### 主 agent 主動判斷 + 通知

主 agent 收到任務時，依上述標準做初判，然後**明確告知 user**：

> 「這個工作我打算走 quick fix mode（單元件 bug fix，scope 小）。如果你覺得需要走 spec mode，告訴我。」

### User 可以調整

- 「升級成 spec mode」— user 認為值得 formal design
- 「降級成 quick fix」— user 認為主 agent 高估了複雜度

### 進行中發現走錯路徑的處理

**Quick fix mode 中發現需要正式 spec**：
- 表徵：plan mode 期間發現「要動的東西比想像多」/「需要新 component」/「跨太多元件」
- 處理：在 plan mode 內停下來告訴 user：「這個 scope 比預期大，建議升級到 spec mode」，user 確認後執行 `/create-spec`

**Spec mode 中發現過度設計**：
- 表徵：spec 過程中發現「這其實是個 bug fix，不需要新 design」
- 處理：告訴 user 並建議切換到 quick fix mode（已寫的 requirements/design 可保留作為 reference）

---

## 邊界案例參考

| 任務 | 推薦 mode | 理由 |
|---|---|---|
| 把一個函數的 NULL 處理修好 | quick fix | 單元件、bug fix |
| 抽出一個 shared utility（從 2 個檔案）| quick fix | refactor、scope 可控 |
| 修一個 race condition | quick fix | bug fix，即使涉及 async logic |
| 加一個新的 CLI 命令 | quick fix 或 spec | 看新命令複雜度 — 純薄殼走 quick fix；含新業務邏輯走 spec |
| 改 ORM model 加一個欄位 | quick fix | 單 schema 變動 |
| 新增一個 connector（如 Slack）| **spec** | 引入新元件 + 新 data flow |
| 替換 auth library | **spec** | 跨多元件 + 涉及安全設計 |
| 大改 cache 策略 | **spec** | 架構層級調整 |
| 修一個 ConfigParser bug | quick fix | bug fix |
| 加 prometheus metrics | quick fix 或 spec | 散落幾處就 quick fix；做一套 instrumentation framework 就 spec |

---

## 兩條路徑的 review loop 對象

兩條路徑都跑 design-reviewer + implementation-reviewer multi-round loop。**reviewer 一律讀 file**（用 Read tool），主 agent 只負責告知 file path。差別僅在 file 在哪：

| Mode | design-reviewer 讀的 file | implementation-reviewer 讀的 |
|---|---|---|
| Spec mode | `.spec/specs/{feature}/design.md` | spec-implementer 寫的 code |
| Quick fix mode | 主 agent 指定的 plan file path | 主 agent 寫的 code |

**Plan file 路徑**：Claude Code 通常在 EnterPlanMode 時自動建立 plan file（以系統實際提供的路徑為準，主 agent 進 Plan Mode 後確認）；若環境沒有提供 plan file，主 agent 自建 `.spec/quickfix/<slug>.md` 代替。不要寫死特定路徑 — 這是版本相依的內部行為。

Plan file 是真實檔案，跟 design.md 一樣可被 Read。主 agent 在 Plan Mode 期間用 Edit incrementally 修改 plan file，每輪 review 後也是用 Edit 修這個檔案。**Reviewer 的核心機制兩種 mode 共用** — 都是「讀主 agent 指定 path 的 file → 產 issue list」，差別只在主 agent 給的 path。

Quick fix mode 的關鍵特性：
- design-reviewer 多輪 review 在 **Plan Mode 內**完成（已驗證 sub-agent 在 Plan Mode 期間可被 invoke）
- ExitPlanMode 提交給 user approve 的就是**已 reviewed 的最終版**
- user 看不到 review 過程，只看到收斂後的 plan

**Steering 與 Quick Fix Mode**：Quick Fix Mode 不要求 steering 存在；但若專案已有 `.spec/steering/`，主 agent 應載入並讓 reviewer 知道（steering alignment 是 review 面向之一），且 quick fix 過程發現的新慣例同樣走 SKILL.md「Steering 演進機制」昇華。

---

## 為什麼 quick fix mode 也強制 review loop

可能有人會問：「修一個 typo 也要跑 review loop 嗎？」

答案是 yes，理由：

1. **小 fix 的 review value 反而更高** — 1 行 weak-ref bug 比 100 行新 feature 更難發現。review 在小範圍更聚焦
2. **review discipline 一鬆懈就回不去** — 一旦允許「這個太小不用 review」，閾值會持續往上飄
3. **0 issues 收斂在小 scope 很快** — typo fix 大概率 review 第一輪就 0 issues，loop overhead 幾乎為零
4. **review loop 是設計品質防線，不是文件儀式** — 防線的價值在於「永遠在」，不在於「對複雜任務在」

如果某個 fix 真的太小（例如改 README 的 typo）連 review 都覺得 overkill，這時應該重新評估：這還算「開發任務」嗎？單純文字編輯可以走非開發流程。
