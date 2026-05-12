# Requirements Document

> ## ⛔ 禁止段落（formal doc 100% 隔離原則）
>
> requirements.md **描述「最終確定的需求」**，不夾雜 review 過程的任何痕跡。以下絕對不可出現：
>
> - 任何 **reviewer letter tag**（`(per Decision X)` / `(per Smell Y)`）/ **Round 過程敘述** / **review-log 引用** / **豁免宣告**
> - 任何 `## Decisions` / `## ADR` / `## Review Notes` 段落
>
> Decision content 屬 `review-log.md §2`；requirements.md 只記**最終商定的 user story / acceptance criteria**。詳見 `references/review-log-bad-examples.md`。

## Introduction

[Provide a brief overview of the feature, its purpose, and its value to users]

## Alignment with Product Vision

[Explain how this feature supports the goals outlined in product.md]

## Requirements

### Requirement 1

**User Story:** As a [role], I want [feature], so that [benefit]

#### Acceptance Criteria

1. WHEN [event] THEN [system] SHALL [response]
2. IF [precondition] THEN [system] SHALL [response]
3. WHEN [event] AND [condition] THEN [system] SHALL [response]

### Requirement 2

**User Story:** As a [role], I want [feature], so that [benefit]

#### Acceptance Criteria

1. WHEN [event] THEN [system] SHALL [response]
2. IF [precondition] THEN [system] SHALL [response]

## Non-Functional Requirements

### Performance
- [Performance requirements]

### Security
- [Security requirements]

### Reliability
- [Reliability requirements]

### Usability
- [Usability requirements]
