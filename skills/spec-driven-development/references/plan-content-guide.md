# Plan / Design 文件內容指引

本文件規範**設計類文件**（quick fix mode 的 plan file、spec mode 的 design.md）應該寫什麼、不應該寫什麼。兩種文件原則一致 — 差別只是長度與正式程度。

## 核心原則：寫實質，不寫流程

文件讀者（人或 reviewer agent）關心「**這次要做什麼、為什麼、有什麼風險**」。**Process 細節由 skill 本身保證**，不需 plan / design 重複敘述。

寫 process narration 等於：
- 重複 SKILL.md 已承諾的內容
- 浪費 reviewer 的 token
- 模糊真正重要的 substance — user 看完不知道你要改哪些 file

## ✅/❌ 對照表

| ✅ 寫 | ❌ 不寫 |
|---|---|
| **Context** — 觸發原因、當前問題、預期改變後狀態 | **Process narration** — 「我會 invoke X 然後 X 會 ...」 |
| **改動清單** — 具體 file path + 改動範圍 | **Skill 紀律重述** — review-protocol.md 條款搬進 plan |
| **風險評估** — 具體 regression / API break / 行為變更 | **Mode 對比表** — 「為什麼不走另一個 mode」（mode-selection.md 已涵蓋）|
| **Architecture Decisions** — 沒共識的選擇 Options + Trade-offs | **預估幾輪 review** — reviewer 決定，不該預估 |
| **驗證方式** — 具體可執行指令 / 測試清單 | **Definition of Done** — skill 自動執行的退出條件 |
| **Out-of-scope**（spec mode）— 明確邊界 | **Agent invocation sequence** 完整 narration |

## 範例對照

### Substance（好範例）

```markdown
## Context
user_service.py::get_user_profile() 在 user_id=None 時 throw NPE。
需要加 input validation。錯誤處理策略待 review 階段決定。

## 改動清單
- agent_service/services/user_service.py:42 — 加 null guard
- tests/services/test_user_service.py — None / 空字串 / 正常值 三組 test

## 風險
- 既有 caller 若依賴 None silent return，改 raise 會 break
- public API 錯誤類型若改變需同步更新 caller

## Architecture Decisions
**錯誤處理策略**
- Option 1: raise ValueError — fail-fast、明確；break 既有 silent caller
- Option 2: return None — 向下相容；延續 silent bug
- 沒共識，依現有 service 層 convention 拍板

## 驗證方式
1. `pytest tests/services/test_user_service.py -v`
2. `grep -r 'get_user_profile' agent_service/` 確認 caller 對齊
3. `podman compose build agent-service`
```

### Process narration（壞範例）

```markdown
## Mode 選擇：Quick Fix Mode  ← 30 行判斷表 + 為什麼不走 Spec Mode
## 完整工作流程概覽  ← 80 行 ASCII 流程圖
## Agent 調用序列  ← 50 行 table 列每個 agent invocation
## Review Loop 機制  ← 70 行 reciting review-protocol.md
## Architecture Decision 處理  ← 30 行 reciting review-protocol.md again
## 紀律重點  ← 20 行 reciting why review matters
## Definition of Done  ← 完成清單，skill 自動執行的事
```

第一份是 50 行有用 substance，第二份是 300+ 行 noise（每段都重複 skill / reference 已說過的話）。

## 長度指引

| 文件類型 | 預期長度 |
|---|---|
| Quick fix plan（單 bug / 小 refactor）| 30-80 行 |
| Quick fix plan（中型 refactor）| 80-150 行 |
| Spec mode design.md（小到中型 feature）| 200-400 行 |
| Spec mode design.md（複雜系統）| 400-800 行 |

**超過上限時自查**：是否在 narrate process？重述 skill 紀律？做不必要 mode 對比？預估 review 輪次？— 任一 yes 就直接刪。

## 例外

只有兩個合理情況可寫 process detail：

1. **流程偏離 skill 預設**：例「這 spec mode 任務因已有部分 code 會 skip Stage 1 直接走 Stage 2」 — 這是 meaningful deviation
2. **複雜 dependency 序列**：spec mode tasks.md 列實作依賴順序 — 規劃**該功能特有**的順序，不是 narrate skill process

普通情況 **default 不寫 process**。
