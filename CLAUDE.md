# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

這是 `aitools` - 專門針對 AI 開發環境設計的 CLI 工具，用於監控和管理 hook 進程，特別是解決 Claude Code hook 卡關等問題。工具提供智能進程檢測、互動式管理和自動化修復功能。

## 核心命令

### 開發命令
```bash
# 開發和測試
bun run dev [command]         # 開發模式執行 CLI
bun run build                 # 使用 bun bundler 建置正式版
bun run typecheck            # TypeScript 型別檢查
bun run lint                 # ESLint 代碼檢查

# 建置版本執行
./dist/cli.js [command]      # 直接執行建置版本
```

### CLI 使用
```bash
# 核心功能
aitools monitor              # 檢測可疑的 hook 進程
aitools list --hooks         # 列出 hook 相關進程  
aitools kill --hooks -i      # 互動式終止 hook 進程
aitools quick               # 一鍵問題解決
aitools stats               # 系統概覽
```

## 架構設計

### 命令模式結構
CLI 使用 Commander.js 搭配命令模式，每個主要功能都實作為獨立的命令類別：

- `src/cli.ts` - 主要進入點，定義所有命令和選項
- `src/commands/` - 命令實作 (MonitorCommand, ListCommand, KillCommand)
- `src/utils/process-monitor.ts` - 核心進程檢測和管理邏輯
- `src/utils/ui.ts` - 使用 chalk, table, ora 的 CLI 介面組件

### 關鍵組件

**ProcessMonitor 類別**: 系統監控的核心邏輯，使用 macOS 特定命令 (`ps`, `vm_stat`, `top`) 來收集進程和系統資訊。包含智能 hook 檢測邏輯，透過 "hook", "claude", "git hook" 等模式識別進程。

**Command 類別**: 每個命令 (monitor, list, kill) 都實作為獨立類別，擁有自己的選項和執行邏輯。都依賴 ProcessMonitor 提供核心功能。

**UI 系統**: 集中化的 UI 助手，在所有命令中提供一致的格式化、彩色表格、載入動畫和狀態圖示。

### 進程檢測邏輯
工具專門針對 AI 開發 hooks：
1. 命令名稱的 hook 相關關鍵字模式匹配
2. 檢測長時間執行的 bash 進程 (>5 分鐘)
3. 監控可疑活動的 CPU/記憶體閾值
4. 交叉參照父子進程關係

### TypeScript 配置
- 使用 ES 模組 (`"type": "module"`)
- 針對 Node.js 搭配 Bun bundler 進行單檔案分發
- 嚴格 TypeScript，在 `src/types/` 中有完整型別定義

## 平台特異性

此工具針對 macOS 優化，使用 `vm_stat` 和 macOS 特定的 `ps` 參數等命令。進程檢測模式和記憶體解析都針對 macOS 系統輸出格式量身打造。

## 開發重點

進行變更時：
- `ProcessMonitor.isLikelyHook()` 中的 hook 檢測模式對準確性至關重要
- UI 格式化使用特定的表格配置，必須維持欄位對齊
- 所有進程操作都包含安全確認和詳細記錄
- 錯誤處理包含對目標使用者友善的訊息

## 代碼國際化規範

**重要**: 此為國際化套件，必須遵循以下語言規範：

### 代碼層面
- 變數名稱、函數名稱、類別名稱使用英文
- 代碼註解使用英文
- 型別定義和介面使用英文
- README.md 和 package.json 使用英文

### 使用者介面
- **所有 CLI 輸出訊息使用英文**（透過 UIHelper 類別集中管理）
- 錯誤訊息、警告、成功提示使用英文
- 指令說明和幫助文字使用英文
- 互動式提示和選項使用英文

## UI 設計規範

**視覺設計原則**：
- 不使用 emoji 圖示，改用扁平化符號（如 ✓、✗、●、○、▪、→ 等）
- 狀態指示器使用簡潔的 ASCII 或 Unicode 符號
- 表格使用單線框架，避免過度裝飾
- 顏色層次分明：綠色表示正常、黃色表示警告、紅色表示錯誤

**表格對齊規則**：
- 所有短欄位內容置中對齊（PID、CPU%、MEM%、Time、Status）
- 長文字欄位靠左對齊（Command、檔案路徑等）
- 動態調整 Command 欄位寬度以適應終端大小