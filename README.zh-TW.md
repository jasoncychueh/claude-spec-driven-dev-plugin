# Spec-Driven Development Plugin

[English](README.md) | **繁體中文**

規格驅動開發(spec-driven development)工作流的 Claude Code plugin。以結構化的 steering 文件、feature spec、驗證機制與 agent 化實作,貫徹「沒有 spec 就不寫 code」的紀律。

## 理念

這套工作流有兩個任務 —— **在設計缺陷還便宜的時候抓出來**,以及**讓人類參與決策卻不被資訊淹沒** —— 兩者都建立在**同一副透鏡**上:用「**真實使用情境 + 執行流程 + 資料結構**」來閱讀每一個變更。

- **Review 用這副透鏡找出真正重要的東西。** Reviewer 從「這段設計服務哪個真實情境?」出發,而不是從檢查清單出發 —— 浮現*核心設計概念*,忽略沒有任何使用情境驅動的理論性邊界案例(那些只需要 fail-fast + 錯誤日誌,不需要防禦性代碼)。Review 多輪執行直到 0 issues;reviewer 只提出問題,從不動手修。
- **溝通用同一副透鏡解釋真正重要的東西。** Review 認定重要的,正是使用者必須理解的 —— 所以 briefing 以及每一則給使用者的訊息,都先經過消化與抽象,用真實情境敘事,且從不假設使用者還記得幾輪之前討論過的結構。降低人類的認知負荷是*全域*紀律,不只是 briefing 那一步。

兩者的橋樑是「**核心設計概念**」:review 決定什麼重要,溝通把使用者的注意力花在重要的地方。

兩條紀律維持文件的乾淨:**正式文件描述「決策之後的世界」** —— *為什麼*(waiver、決策、被否決的路徑)住在 `review-log.md`,絕不污染 requirements/design/tasks/code;以及 **steering 是活的 —— 但克制**:只有「不記下來幾乎必然造成跨 feature 不一致」的專案級原則,才在使用者確認後晉升;預設是不收錄(spec 專屬的選擇、實作細節、一次性決策都不屬於 steering)。

還有一個結構性選擇,讓 token 經濟也保持誠實:**生成在 subagent,仲裁在主 agent**。主 agent 的 token 只花在高槓桿的判斷上:組織任務與方向、提煉 brief、上呈決策,以及**挑戰每一個 subagent 的結論**;所有長文生成(plan、spec 文件、程式碼、review)都跑在 persistent subagent session 裡,跨 review 輪次以 resume 接續而非重新生成。負責撰寫、審查、驗證的 subagent 一律用 opus:執行者(implementer、tester、兩個 verifier)固定 medium effort,判斷角色(author、兩個 reviewer)跟主 session 用同一個 effort,由 `/effort` 決定它們想多深。品質靠的是對抗式仲裁 —— 每一輪強制的 challenge exchange —— 而不是在大量寫作上開到最高 effort。

## 功能特色

- **Steering 文件**:專案層級的指引(產品願景、技術棧、程式碼結構)
- **Feature Spec**:每個 feature 的 requirements、design、tasks 與 review-log
- **自動化驗證**:spec 完整性檢查 + tasks 與 design 對齊檢查
- **Agent 化實作**:平行實作 + 跨 agent review
- **生成/仲裁分工**:主 agent 負責仲裁 —— 組織任務、提煉 brief、挑戰每一個 subagent 的結論 —— 所有長文生成(plan、文件、程式碼、review)由 opus 的 persistent subagent session 承擔,執行者用 medium effort、判斷角色跟主 session 同 effort:品質靠對抗式挑戰把關,token 省在大量寫作上
- **Review Log 紀律**:Waivers / Decisions / 逐輪稽核軌跡住在 `review-log.md`;正式文件(requirements / design / tasks / code)保持乾淨
- **活的 Steering**:review loop 會浮現未記錄的專案原則作為 steering 候選;使用者確認後隨開發進程回流到 steering 文件
- **Backlog 與 Roadmap**:流程中發現、當下無法解決的事 —— 延後處理的 review issue、範圍外的發現、懸而未決的討論 —— 會默默記成一張票(一張票只裝一個題目),存進票的總表 `.spec/backlog/backlog.json`(記錄永不刪除,結案只是加上結案資訊),每張票另有一個 Markdown 本體,不隨 session 結束蒸發。roadmap(`.spec/roadmap/roadmap.json`)只存結構:一棵照架構長的樹,帶順序與依賴,能精確回答「現在可以開工什麼」,用 id 引用票。未分類的籃子就是「還沒結案、也沒被任何節點引用的票」;`promote` 只是加一個引用,不會丟失任何資料。兩者都只透過 `scripts/board.mjs` 讀寫:它驗證每次修改、產生不會撞號的 id、處理認領,而且永遠操作 main 工作樹那份;`/backlog` 與 `/roadmap` 負責驅動它
- **Brief Before Build**:實作開始前,以對話式摘要呈現重點、已決策事項與 waivers,讓使用者不必讀完整份 spec 就能進入狀況 —— 這是抓出誤解最便宜的時刻
- **認知負荷校準**:全域紀律 —— 主 agent 在每則訊息前先消化與抽象,用真實使用情境 + 執行流程 + 資料結構敘事,並主動重述前幾輪的脈絡;review 與 briefing 用同一副透鏡找出並解釋核心設計概念

## 指令

| 指令 | 說明 |
|---------|-------------|
| `/create-steering` | 建立專案 steering 文件 |
| `/create-spec <feature>` | 建立 feature spec(requirements、design、tasks) |
| `/load-spec <feature>` | 載入 spec 並顯示進度 |
| `/update-steering <type>` | 更新 steering 文件(product/tech/structure) |
| `/update-spec <feature>` | 更新 feature spec |
| `/verify-spec <feature>` | 驗證 spec 完整性 + tasks 與 design 對齊 |
| `/implement <feature>` | 透過 agents 開始實作 |
| `/backlog [args]` | 列出 / 撿起 / 結案未分類籃子裡的項目 |
| `/roadmap [args]` | 顯示排程中的 roadmap 樹、下一步可開工的項目、把項目放上樹、逐枝討論 |

## Agents

| Agent | 角色 |
|-------|------|
| `spec-researcher` | 設計前研究既有解決方案 |
| `spec-verifier` | 驗證 spec 檔案完整性 |
| `tasks-design-verifier` | 驗證 tasks 與 design 對齊 |
| `spec-author` | 依主 agent 的 brief 撰寫/修訂規劃與 spec 文件(persistent session) |
| `design-reviewer` | 多輪設計 review 直到 0 issues(只 review) |
| `spec-implementer` | 依 spec 實作程式碼 |
| `implementation-reviewer` | 多輪實作 review 直到 0 issues(只 review) |

## Hooks

| Hook | 用途 |
|------|---------|
| `PreToolUse` on `ExitPlanMode` | 一個確定性、無狀態的 Node command hook(`hooks/briefing-checkpoint.js`),在**每一次** `ExitPlanMode` 上強制執行 Plan Briefing(Quick Fix Mode、`/create-spec` 與 `/update-spec` 的 plan 階段、以及一般 plan mode —— briefing 能降低任何 plan 的閱讀負荷,fail-open 設計讓一般 plan mode 也安全)。當 `ExitPlanMode` 之前有真實的使用者回覆時**放行**(即 turn-final briefing 流程)—— 會跳過 agent 的機械性工具回合(例如載入 deferred `ExitPlanMode` 的 `ToolSearch`、核准後的 `Edit`),使其不干擾判定 —— 而對「寫完 plan 直接 `ExitPlanMode`」的跳過行為則**攔截**並附上簡短提醒。檢查**錨定在當前 plan session**——回溯至 plan mode(重新)進入之處(手動的 `permission-mode:plan` 標記,或 `EnterPlanMode` 工具呼叫),因此 briefing 的要求以進入後為準,拒絕時也絕不會指向 Claude Code 重啟前的舊訊息(重啟會丟失 plan-mode 狀態,必須手動重新進入)。任何不確定情況一律 fail-open,絕不死鎖;過濾 subagent(`isSidechain`)與注入(`isMeta`)項目;只讀 transcript,不寫任何東西。 |
| `SessionStart` on `startup`/`resume` | 一個小型 Node command hook(`hooks/session-start-skill-reminder.js`),注入簡短提醒:任何程式碼工作都應載入並使用 spec-driven-development skill。靜態 context 注入 —— 不做專案偵測;提醒文字本身陳述「如果這是程式碼專案」的條件,由 agent 自行判斷。SessionStart 無法攔截;腳本不讀不寫任何東西。 |
| `PreToolUse` on `*`(僅在 executor 內部） | 一個 Node command hook(`hooks/dispatch-checkpoint.js`),在 executor 自己的 session 內執行——`agent_id` 只在 subagent 呼叫時存在,所以主 agent 永遠不會被它叫住——每當一次派工超過該型別的門檻(implementer 45 次工具呼叫、tester 20 次,依此類推),請它用 `SendMessage` 把進度發給主 agent,然後繼續做。它不停任何東西、也不等回覆:主 agent 下一個 turn 讀到,只有方向錯了才回覆,而回覆會在執行途中送達 executor。絕不叫 executor 少讀檔。取代 1.24.0 移除的 `maxTurns` 上限 |
| `PreToolUse` on `SendMessage` | 一個 Node command hook(`hooks/session-longevity-checkpoint.js`),在續派的當下讀出目標 executor 的真實 context 大小,到 400K 就要求退役——遠低於 harness 會自動壓縮的點,所以 executor 不會落到照著自己設計基礎的摘要在寫碼。只注入 context,不擋 |

> Hooks 在 session 啟動時載入 —— 安裝或更新 plugin 後,需重啟 Claude Code session 才會生效。

## 安裝

### 從 GitHub 安裝(建議)

在 Claude Code 內執行以下指令。第一條把這個 repo 註冊為 plugin
marketplace(由 `.claude-plugin/marketplace.json` 定義);第二條從中安裝 plugin:

```
/plugin marketplace add jasoncychueh/claude-spec-driven-dev-plugin
/plugin install spec-driven-development@claude-spec-driven-dev-plugin
```

> `spec-driven-development` 是 plugin 名稱;`claude-spec-driven-dev-plugin`
> 是 marketplace 名稱。兩者不同 —— `plugin@marketplace` 參數中兩者都要保留。

也可以互動式安裝:執行 `/plugin`,然後選擇
**claude-spec-driven-dev-plugin → spec-driven-development**。

`/plugin marketplace add` 也接受完整的 git URL:

```
/plugin marketplace add https://github.com/jasoncychueh/claude-spec-driven-dev-plugin.git
```

### 從本地 clone 安裝(開發用)

```bash
git clone https://github.com/jasoncychueh/claude-spec-driven-dev-plugin.git
```

然後把 marketplace 指向本地路徑並安裝:

```
/plugin marketplace add path/to/claude-spec-driven-dev-plugin
/plugin install spec-driven-development@claude-spec-driven-dev-plugin
```

## 核心原則

1. **No Steering, No Development** —— 沒有 steering 就不開發
2. **No Spec, No Code** —— 沒有 spec 就不寫 code
3. **Research Before Design** —— 設計前先研究
4. **Design is Truth** —— design.md 是唯一真相來源
5. **Steering Stays Current** —— steering 與專案同步演進
6. **Self-Verify** —— 實作者自我驗證
7. **Verify Before Deliver** —— 交付前必過驗證
8. **Calibrate for Cognitive Load** —— 每則給使用者的訊息都先消化與抽象,用真實使用情境 + 執行流程敘事,從不假設使用者記得前幾輪的結構;review 與 briefing 共用這一副透鏡

## 致謝

本專案的靈感來自 [spec-workflow-mcp](https://github.com/Pimzino/spec-workflow-mcp) —— 其 steering 文件 + spec(requirements / design / tasks)工作流塑造了這裡的核心模型。本 plugin 將該工作流以 Claude Code 原生形式重新構想(skill + commands + agents + hooks)而非 MCP server,並加入自己的重點:review-log 與正式文件的隔離、活的 steering、多輪 agent review loop、使用情境優先的 review、Brief-Before-Build briefing 檢查點,以及為人類認知負荷校準每一次互動。
