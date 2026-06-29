# Changelog

版本歷史與決策脈絡集中於此。skill / reference / agent 文件只描述**當前規則 + 技術理由**，不narrate 版本演進 — 與本 plugin 自己的「正式文件描述決定後的世界」原則一致。

## 1.7.3 (2026-06-28)

把 Steering Candidate 的門檻大幅拉高、預設不昇華 —— 解決「每輪 review / 實作後幾乎都冒出一堆其實是 spec-specific / 太細節 / 專案記憶級、不該進 steering 的昇華候選」的過度觸發問題。

- **根因**：SC 生成點（review-protocol「Steering Candidates」、兩個 reviewer 的 SC 段、checklists §6）門檻又低又模糊（「依賴或確立 steering 未記錄的專案級原則 / 慣例」就列）；SKILL「Steering 演進機制」的「為什麼」又偏向多昇華（強調不昇華會讓 steering 過時）；真正的排除清單只在 steering-guide，reviewer 生成 SC 時根本不會讀到。
- **新門檻（權威定義在 `review-protocol.md`「Steering Candidates」）**：**預設不昇華**。三條同時成立才列 SC —— (1) 貫穿整個專案的核心概念 / 原則 / 慣例；(2) 不記進 steering 幾乎肯定會造成未來規劃或實作的不一致或困難（「不記會出事」而非「記了比較好」）；(3) steering 目前確實沒寫。**明確排除** spec-specific 選擇、實作細節、專案記憶級事實、「記了比較整齊但沒它也不會出事」的東西。判斷不出來就不是 SC。寧可漏一個邊緣的，也不要灌水（灌水稀釋護欄、洗版 user 注意力 —— 呼應 v1.7.0 的認知負擔準則）。
- **同步收緊**：design-reviewer / implementation-reviewer 的 SC 段、checklists §6（Design + Impl）、spec-implementer 的候選提報、decision-escalation 的「拍板後昇華判斷」都改成高門檻 + 預設不昇華；SKILL「Steering 演進機制」加克制原則、「為什麼」改成平衡（過度昇華是更常見的實務失敗）；核心原則 #7 `Steering is Living` → `Steering is Living (but restrained)`。

## 1.7.2 (2026-06-28)

新增 SessionStart hook，在 session 啟動 / resume 時注入一段提醒，要 agent 載入並使用 spec-driven-development skill（補強 skill 容易被 under-trigger 的問題）。

- 新增 `hooks/session-start-skill-reminder.js`：固定輸出 `hookSpecificOutput.additionalContext` 一段提醒 —— 「本專案安裝了此 skill；若為程式專案，規劃/動手前先載入並使用（會自動分流 Quick Fix / Spec Mode 並跑強制 review loop）；非程式專案略過」。掛在 hooks.json 的 SessionStart，matcher `startup|resume`（不含 compact，避免 session 中途注入）。
- **不做專案偵測**：是否為程式專案的判斷直接寫進 prompt、交給 agent。SessionStart 每次啟動都跑，靜態字串最輕量，省去 file-scan 成本與型別誤判。
- SessionStart 無法 block、純注入 context；腳本唯讀、無副作用。hooks.json / README Hooks 章節同步描述兩個 hook。

## 1.7.1 (2026-06-28)

修正 briefing checkpoint hook 在**手動進入 plan mode**（尤其 restart 後重進）會誤擋、卡住的問題。

- **根因**：1.6.7 把 hook 改成「保護每一個 ExitPlanMode」，但用「最近一則實質訊息是不是 user 回覆」判斷，而它**看不見手動進入 plan mode 的標記**（`{type:"permission-mode",permissionMode:"plan"}` 不是 user/assistant，被 classify 當雜訊跳過）。於是往回走會越過手動重進的標記、甚至越過 restart，撞到 restart **之前**的 agent 文字就 DENY —— deny 指向跟這次 plan session 無關的過時文字，agent 搞不清狀況而卡住。典型觸發：agent 進 plan mode → 過陣子重開 Claude Code（plan mode 狀態掉了）→ user 手動 shift+tab 重進續流程 → ExitPlanMode 被卡。
- **修法**：把檢查**錨定在「當前這次 plan session」**。往回走遇到 plan mode 的（重）進入邊界就停 —— 手動的 `permission-mode:"plan"` 標記，或 agent 的 `EnterPlanMode` tool call。邊界之後沒有 briefing + user 回覆 → DENY（但可解：brief → 結束回合等回覆 → 重試即放行）；邊界之後有 user 回覆 → 放行。如此 deny 不再洩漏到 restart 之前的過時文字，且 restart 後重進會正確要求補一段新的 briefing。
- **配套**：briefing-guide 新增「restart 後手動重進 plan mode 續流程 → ExitPlanMode 前補 condensed briefing」觸發，沿用既有「/implement 隔 session condensed briefing」pattern，讓 agent 自動補 briefing、全程不卡。
- 新增 `hooks/briefing-checkpoint.test.js`：用真實 transcript 的標記形狀構造情境（spec-driven 有/無 briefing、手動重進有/無 briefing、不可洩漏到 restart 前的 stale reply 等），`node` 直接跑、免 test framework。鎖住這個曾在 1.6.6 漏掉手動進入路徑的回歸。
- hooks.json / README Hooks 章節同步描述錨定行為。

## 1.7.0 (2026-06-28)

把「為人類認知負擔校準」昇華為主 agent 全域準則，並讓 review 與 briefing 共用同一個「使用情境 + 執行流程 + 資料結構」透鏡。

- **新增全域準則（核心原則 9）「Calibrate for Cognitive Load」**：主 agent 對 user 的任何輸出（mode 宣告 / 進度 / 問題說明 / review 結論 / summary / Decision 升級 / briefing）都先消化、抽象再呈現。過去認知負擔校準的哲學散落在 briefing-guide 與 decision-escalation-guide 兩個檢查點，沒有一條全域準則 — SKILL.md 新增「為人類認知負擔校準」節統一三個下游應用。放 SKILL.md 而非 reference：reference 只在跑到該檢查點才 lazy load，全域準則必須常駐 context。
- **review 改為 use-case-first**：`review-protocol.md` 新增「Review 方法：先建使用情境模型，再交叉比對」 — 先盤點真實 use cases + 資料結構 + 執行流程當判斷基準，而非從 checklist 條目逐條套。design-reviewer / implementation-reviewer 工作流程加「先建使用情境模型」步驟，checklists.md 兩節開頭加 gating note 指向協定（不重述，防漂移）。
- **新增上位判準「無使用情境的邊緣 case 不過度設計」**：理論可達但無真實情境驅動、不應發生的路徑 → 不寫防禦程式碼，改 fail-fast + error log（不可 silent）。明文界定這是「不過度設計」非忽略 robustness — 有真實情境的失敗路徑照常要 robust。凌駕 Failure Modes / Bugs 面向。
- **briefing 與 review 收斂為同一透鏡**：briefing-guide 強化「從 use case 出發」→ 帶出該情境觸及的執行流程與資料結構、不假設 user 記得前幾輪講過的結構（人類跨輪 / 長期會忘記架構）；明講 briefing 重點說明的就是 review 找出的核心設計概念。decision-escalation-guide 加 cross-link 標明它是全域準則的具體化。
- 連帶：核心原則清單 Spec / Quick Fix Mode 編號順移（9–14 → 10–15，#1–#8 不動，CHANGELOG 對「核心原則 8」的引用不受影響）；README Core Principles 同步。

## 1.6.8 (2026-06-16)

修正 hook 對 **deferred ExitPlanMode** 的誤擋。實測:user 批准後,agent 必須先 `ToolSearch` 載入 deferred 的 ExitPlanMode 工具（並常回一句確認）,這些 agent 回合插在「user 批准」與「ExitPlanMode」之間 → hook 看到緊鄰的是 agent 動作而非 user 回覆 → 誤擋,逼 user 再批准一次。

- **修法**：hook 往回找時**略過 agent 的機械性回合**（任何帶 `tool_use` 的 assistant 回合 —— ExitPlanMode 本身、載入它的 ToolSearch、批准後的 Edit 等）+ tool_result + 注入訊息,只認第一個「實質」訊息:user 回覆 → 放行；agent 純文字（其後無 user 回覆）→ 擋。
- 「agent 講完話沒等 user 回覆就 ExitPlanMode」仍擋得住；deferred-tool ToolSearch、批准後小編輯不再誤擋。代價:純靠 tool call、完全無文字敘述的 skip 可能漏（安全方向,絕不 false-block）。

## 1.6.7 (2026-06-16)

briefing 全面覆蓋 + /update-spec 升級到與 /create-spec 同等紀律。

- **briefing 重新定位**：briefing 是為了**降低讀完整 plan/spec 的認知負擔**,不只是審核 gate。所以凡 user 即將面對一大坨 plan/spec 的時刻都該有 briefing,不只 Quick Fix。
- **新增 briefing 點**：/create-spec plan-exit（方向確認,輕量）、/update-spec plan-exit（改動規劃）、/update-spec 結尾（改動定案 Spec Briefing）。原有的 /create-spec 結尾 Spec Briefing、Quick Fix Plan Briefing、/implement condensed 不變。
- **/update-spec 升級**：design.md 有實質變更時,跑與 /create-spec **同等的強制 design-reviewer 多輪 loop**（到 0 issues,同協定:Decisions 兩拍、Critical/High 必修、Medium/Low defer-and-batch、Steering Candidates、保險絲、100% 隔離）;plan-exit + 結尾各一個 briefing。改已完成的 spec 風險不亞於新建,不該是更輕的路徑。純 requirements 釐清 / 純 tasks 狀態 bookkeeping 可略過 loop。
- **hook 改為保護「每一個 ExitPlanMode」**（移除 1.6.6 的 design-reviewer cycle-scoping）：理由 — briefing 降認知負擔對任何 plan 都有益,且 hook fail-open 不會弄壞 plan mode,故不限縮。好處:create-spec/update-spec 的 plan-exit 不會漏（其 design-reviewer Mode A 是 optional,scoping 會漏判）;普通 plan mode 也一併受保護（多一道摘要、無害）。hook 因此**大幅簡化** — 只剩「ExitPlanMode 前一則是否為 user 回覆」的 skip 判斷 + isSidechain/isMeta 濾除 + fail-open,移除了 design-reviewer 偵測與 cycle-start 界定整套。
- 連帶:design-reviewer 適用範圍加 /update-spec、review-protocol 收斂提醒改 mode-aware、briefing-guide 觸發表 + 認知負擔原則 + 三層架構第 3 層同步。

## 1.6.6 (2026-06-15)

ExitPlanMode 的 briefing checkpoint 從 **prompt hook 改為 deterministic command hook**，根治 1.6.2–1.6.5 的 deadlock。（註:本版號先前曾有一個「移除 hook」的短命提交被 push 後又 force-push 撤回、未留存於遠端;此 1.6.6 為正式版本。若本機 plugin cache 殘留舊的 1.6.6 目錄,需清除後重新拉取才會取得此版內容。）

- **根因**：prompt hook 的判斷者是一個 LLM、看不到對話歷史。即使被指示「永遠放行」，它仍會因「無法確認 briefing 是否已交付」保守 block ExitPlanMode —— briefing 已正確交付、user 已確認的情況下照樣擋，造成 agent 無法 propose plan 的 deadlock（實測連 block 兩次）。LLM 會自我推翻 prompt 指令，無法當可靠的 gate。
- **解法**：改用 Node command hook（`hooks/briefing-checkpoint.js`，deterministic code，非 LLM）。讀 transcript 判斷「ExitPlanMode 前一則是否為真正的 user 回覆」—— turn-final briefing 紀律保證合法流程一定緊接 user 回覆；skip 一定是 assistant / tool_result。是 → 放行；skip → 擋並回一句簡短提醒。
- **範圍限縮（不綁架正常 plan mode）**：hook 雖掛在所有 ExitPlanMode，但**只在「這個 plan cycle 跑過 design-reviewer」**（= spec-driven Quick Fix 流程）時才 enforce。cycle 起點用**最近一次進 plan mode**（`permission-mode:plan` / `mode:plan` / `EnterPlanMode` tool_use）界定,design-reviewer 須在起點之後才算數 —— 兩輪之間（如 Spec Mode `/create-spec`,也跑 design-reviewer 但不在 plan mode）的呼叫不會被誤計。**找不到 cycle 起點即放行**(不退用「上一個 ExitPlanMode」當邊界,那是上一輪結尾、會把空檔折進來造成 false-positive)。普通 plan mode 沒有 design-reviewer → 一律放行,裝了 plugin 不會影響內建 plan mode。
- **不會 deadlock**：briefing 完 + user 回覆後前一則就是 user 訊息 → 放行；且 **fail-open** —— 讀不到 transcript / 解析失敗 / 非 Quick Fix cycle 一律放行，只在「確定是 spec-driven cycle 內的 skip」才擋。
- **判別細節**：subagent 呼叫在 transcript 是 `Agent`/`Task` tool_use + `input.subagent_type`；hook 據此偵測 design-reviewer。並濾除 `isSidechain`（subagent 內部訊息,否則會 false-deny）與 `isMeta`（注入的 local-command / reminder,否則 false-allow）。真人回覆是 `type:user` 且 content 為 string。
- **marker 經實測驗證**（對真實 transcript）：user 手動 shift+tab 進 plan mode → `{type:"permission-mode", permissionMode:"plan"}`；agent 用工具進 → `EnterPlanMode` tool_use。兩條 cycle-start 路徑都偵測得到,所以「user 先手動進 plan mode」不會造成漏判。（`mode` 欄位在 bypassPermissions session 恆為 `"normal"`,plan 狀態存在 `permissionMode`。）
- **跨平台 + 無狀態**：純 Node（Claude Code 自帶），Windows/Linux/Mac 通用；只讀 stdin + transcript（唯讀），不在任何地方（含專案資料夾）寫檔。命令用 `node "${CLAUDE_PLUGIN_ROOT}/hooks/briefing-checkpoint.js"`。
- briefing-guide「三層提醒架構」第 3 層改述為 command hook；README Hooks 章節同步。

## 1.6.5 (2026-06-12)

- **Briefing / 提問改為「回合終止交付」**（實測回饋：1.6.4 兩拍制下 briefing 仍然看不到）：根因 — 夾在 tool call 前的「回合中段文字」顯示不可靠，CLI 與 remote-control 都會整段隱形，只有**回合最終訊息**在所有 client 保證顯示。修正：
  - Briefing（Plan / Spec / condensed）必須以**回合最終訊息**交付並**結束回合**（同回合不接 AskUserQuestion / ExitPlanMode / 任何工具）；結尾固定確認問句，**user 的回覆就是確認** — briefing 停點不再需要 AskUserQuestion 選項卡
  - Decision escalation 的兩拍制改為**兩個回合**：briefing 回合（最終訊息 + 結束回合）→ user 回覆 → 提問回合（短 stem AskUserQuestion；user 已在回覆中表態則跳過）
  - 三層提醒（review-protocol 收斂結論 / tasks-design-verifier 報告 / ExitPlanMode hook）措辭同步；briefing-guide 新增「補救」節（user 反映沒看到 → 以回合最終訊息重新交付）

## 1.6.4 (2026-06-12)

- **AskUserQuestion 全面兩拍制**（實測截圖回饋：Decision 提問時 user 看不懂在問什麼）：context 塞進 question stem 的策略與 TUI 對抗 — stem 對話框窄小難讀、code preview 被折疊，且內容易壓縮成未解釋的行話。改為：(1) 先用對話文字輸出問題 briefing（review 脈絡 + 以實際 use case 講問題 + code 對照，markdown 完整渲染）；(2) 再發 stem 很短（1-3 行）的 AskUserQuestion。適用所有 AskUserQuestion 互動：Decision 拍板、Medium/Low waiver 批次、Steering Candidates 批次
- decision-escalation-guide 的好範例改寫為兩拍制示範，第一拍以 use case 開場（「列表頁圖示 → A 看到 B 的記憶暗示」），不從概念詞開場

## 1.6.3 (2026-06-12)

- **Briefing 敘事方式改為 use-case-driven**：briefing 與 plan / design 的本質差異是敘事視角 — 文件描述「系統是什麼」（概念性、為反覆查閱優化），briefing 描述「使用者會經歷什麼」（為第一次理解優化）。以 1-2 條代表性 use case（happy path + 關鍵 failure path）走流程，元件 / 新概念 / Decisions 的後果在場景中帶出，取代純概念條列；Quick Fix 敘事形：「bug 在什麼操作下發生 → 修完同個操作變怎樣 → 剩什麼風險」
- **1.6.2 根因記錄修正**：實測發現 briefing 並非完全沒觸發 — 是文字輸出後緊接 ExitPlanMode，被 plan 審核視窗蓋掉看不到（UI 層問題）。1.6.2 的兩拍制剛好同時解決可見性（AskUserQuestion 小選項框在 plan 大視窗之前，briefing 文字就在其上方可見）；三層提醒保留，防真正跳過的情況

## 1.6.2 (2026-06-12)

針對 briefing 實測沒有出現的問題加固（後於 1.6.3 確認實際根因是 UI 遮蔽，本版的結構性修正仍然有效且必要）：(a) 純文字輸出步驟沒有 blocking tool call，agent 可能跳過或跟下一步擠在同一輪；(b) SKILL.md 在任務開頭載入，briefing 決策點在幾十輪 tool call 之後，步驟指示已遠離注意焦點（或被 context compaction 摘要掉）。

- **兩拍制停點**：briefing 輸出後必須立即接 AskUserQuestion（「繼續」/「有疑問」）— tool call 才是強制停點，user 確認後才能進下一步（ExitPlanMode / 結束 /create-spec / Stage 1）
- **三層轉場提醒**（把提醒放在轉場時刻的最新 context，不只靠任務開頭的步驟清單）：
  1. review-protocol.md 收斂結論模板附帶續步提醒（design 收斂 → briefing 在 ExitPlanMode 前）
  2. tasks-design-verifier 通過報告附帶 Spec Briefing 續步提醒（原樣輸出指定文字）
  3. 新增 `hooks/hooks.json`：PreToolUse hook 攔 ExitPlanMode，harness 強制注入 briefing 檢查提醒（永不 block，只注入 systemMessage）— 不依賴模型自覺的最後防線
- 注意：hooks 在 session 啟動時載入 — 更新 plugin 後需重啟 session 才生效

## 1.6.1 (2026-06-11)

- **Briefing 機制（Brief Before Build，核心原則 8）**：實作開始前主 agent 用對話輸出 spec / plan 重點摘要，讓 user 低成本進入狀況、在最便宜的時點觸發討論。三個觸發點：
  - `/create-spec` 完成兩個 verifier 後 → 完整 Spec Briefing（定位 / 架構重點 / 拍板 Decisions / Waivers / 實作展望 + 邀請討論）
  - `/implement` 於新 session 啟動 → condensed briefing（10-20 行重建 context）
  - Quick Fix Mode 在 ExitPlanMode **之前** → Plan Briefing（ExitPlanMode 呈現完整 plan，briefing 是它的人類入口）
- 新增 `references/briefing-guide.md`：內容結構 / 認知校準（2-3 分鐘讀完、翻譯不是節錄）/ user 疑慮處理流程。釐清與隔離紀律的關係 — briefing 是對話輸出非 formal doc，可（且應該）揭露 review 結論（Decisions / Waivers），但不回寫進文件

## 1.6.0 (2026-06-11)

### Steering 整合
- **Steering Alignment 成為正式 review 面向**：design-reviewer（面向 6）與 implementation-reviewer（面向 6）依 tech.md / structure.md 的選型、設計哲學、慣例、模組邊界審查設計與程式碼。判斷紀律：違反明文條文 → issue（通常 High）；與 steering 衝突但可能 steering 過時 → Architecture Decision（user 決定修設計或更新 steering）；steering 沒寫而本次確立新原則 → Steering Candidate
- **Steering 演進機制**：三掛載點（reviewer 的 non-blocking `📌 Steering Candidates` 區段 / Architecture Decision 拍板後的昇華判斷 / 實作過程發現）+ 輕量更新路徑（AskUserQuestion 批次確認 → 直接 Edit steering → 一致性檢查），不走 /update-steering 完整 Plan Mode。review log 新增 §5 Steering Updates 記錄昇華項（原則 / 寫入位置 / 來源）

### Review loop 行為變更
- **Medium/Low defer-and-batch**：mixed round 不再逐輪詢問 user — 累積到 Critical/High 清零的那一輪一次批次 AskUserQuestion
- **收斂保險絲**：第 5 輪仍有新 Critical/High → 停止 loop，整理跨輪 pattern 向 user 報告結構性問題（升級，不是收斂）
- **雙向誠實明文化**：reviewer 乾淨一輪輸出 0 issues 是好結果不是失職；發明 issue 與假收斂同罪

### 架構修正
- **Reviewer 支援 Quick Fix Mode**：design-reviewer / implementation-reviewer 的 workflow 不再寫死 Spec Mode 路徑（steering / requirements / design.md / tasks.md）— 改為「讀主 agent 指定的文件；steering 存在才讀」，frontmatter description 同步涵蓋兩種 mode
- **Reviewer model 改 `inherit`**：跟隨 session model，不再寫死 opus（verifier 類維持 sonnet）
- **Quick Fix plan file 路徑去耦合**：不再寫死 `~/.claude/plans/<random>.md`，改為 EnterPlanMode 時確認實際路徑；環境未提供時 fallback 自建 `.spec/quickfix/<slug>.md`

### Drift 修正與單一來源化
- spec-verifier 內嵌的 checklist 副本移除（含已漂移的「Prompt 欄位」stale 項）— checklists.md 為唯一來源；spec-verifier 僅保留其特有的跨文件 Review-Residue regex 檢查
- reviewer agent 檔的審查面向細項清單收斂為一行式定調 + 指向 checklists.md；嚴重度表以 review-protocol.md 為唯一來源
- checklists.md 修正殘留的舊版 /load-spec 驗證行為敘述（/load-spec 載入時不驗證）
- spec-workflow.md 輸出位置補上 review-log.md；移除重複 bullet
- review-log-template.md 不再把 `${CLAUDE_PLUGIN_ROOT}` 路徑複製進使用者 repo（變數在使用者專案不會展開）
- decision-escalation-guide.md 移除殘留個人註記
- README agents 表補上 design-reviewer；修正 implementation-reviewer 的「Review + fix」描述（reviewer 是 review only）
- 文件內的版本敘事（「1.4.0 曾允許…1.5.0 廢止」）全部移除，保留行為理由（pointer 誘發 drift），歷史脈絡移入本檔
- SKILL.md frontmatter 與 mode-selection.md 對齊：純文字編輯（README typo）可走非開發流程

## 1.5.0

- **100% formal-doc 隔離**：廢止 1.4.0 的 footnote pointer（`> ⓘ ... — 詳見 review-log §X`）。實測發現：只要允許任何「formal doc 提一下 review-log」的後門，agent 會逐步退化 — 寫回整段 `## Architecture Decisions Record`（業界 ADR pattern 訓練深植）、在表格用 `(per Decision O)` letter tag、寫「Round 1 提出」過程敘述。唯一可靠的紀律邊界是 formal doc 對 review-log 完全零引用，設計理由用中性 design rationale（技術限制 / codebase 慣例 / 反面後果）表達
- spec-verifier 新增跨文件 Review-Residue regex 檢查；implementation-reviewer 把 code 內 review-residue 註解開為新 Smell；新增 review-log-bad-examples.md（5 種 pattern bad/good 對照）

## 1.4.0

- **Review-log 機制**：waivers / decisions / 跨輪 audit trail 從正式文件移入 review-log.md（背景：tasks.md 曾被 8 行「SRP 例外（已知並接受）」區塊污染 — 正式文件回歸 single source of truth 可讀性）。當時允許 1 行 footnote pointer 作為「異常但 tracked」signal（1.5.0 廢止）

## 1.3.0 以前

- Architecture Decision 呈現紀律（decision-escalation-guide：context-first / code 直接貼 / 多維度 trade-off / AskUserQuestion 欄位使用）
- Plan 內容指引（plan-content-guide：寫 substance 不寫 process narration）+ review protocol lazy loading
- 兩 mode 路由（Quick Fix / Spec）+ 多輪 review protocol（D/I prefix、letter ID 跨輪累加、0 issues 收斂）
- Steering 三文件 + spec 三文件工作流、verifier agents、spec-implementer 兩 mode
