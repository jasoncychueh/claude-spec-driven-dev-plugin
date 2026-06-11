# Changelog

版本歷史與決策脈絡集中於此。skill / reference / agent 文件只描述**當前規則 + 技術理由**，不narrate 版本演進 — 與本 plugin 自己的「正式文件描述決定後的世界」原則一致。

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
