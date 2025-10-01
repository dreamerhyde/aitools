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

## 發布流程

### 自動化 Release 系統

本專案使用自動化發布流程，結合本地腳本和 GitHub Actions：

#### 快速發布指令
```bash
# Patch release (1.0.5 → 1.0.6) - 修復 bug
bun run release:patch

# Minor release (1.0.5 → 1.1.0) - 新增功能
bun run release:minor

# Major release (1.0.5 → 2.0.0) - 重大變更
bun run release:major
```

#### 執行流程詳解

1. **環境檢查** (`scripts/release.sh`)
   - 確認工作目錄乾淨（無未提交修改）
   - 確認當前在 main branch
   - 若有問題會中斷並提示

2. **程式碼同步**
   - 執行 `git pull origin main` 確保最新

3. **建置驗證**
   - 執行 `bun run build` 確保程式碼可正確編譯
   - 產生 `dist/cli.js` 發布檔案

4. **版本更新**
   - 使用 `npm version` 更新 package.json
   - 自動建立 commit: `chore: release vX.X.X`
   - 建立對應的 git tag

5. **推送變更**
   - 推送 commits 到 origin/main
   - 推送版本 tag（如 v1.1.0）

6. **自動發布** (GitHub Actions)
   - `.github/workflows/npm-publish.yml` 偵測新 tag
   - 自動觸發 CI/CD pipeline
   - 發布到 npm registry (@dreamerhyde/aitools)

#### 版本號選擇指南
- **patch**: 修復 bug、小調整（1.0.5 → 1.0.6）
- **minor**: 新增功能、非破壞性改進（1.0.5 → 1.1.0）
- **major**: 破壞性變更、大改版（1.0.5 → 2.0.0）

#### 發布前檢查清單
- [ ] 所有測試通過 (`bun run typecheck`)
- [ ] 程式碼格式正確 (`bun run lint`)
- [ ] CHANGELOG 或 commit messages 清楚描述變更
- [ ] 本地測試新功能正常運作

### 資源監控顏色編碼系統

`aitools monitor` 命令使用智能顏色編碼來快速識別系統健康狀態：

#### 標準三階顏色系統 (CPU/MEM/GPU 進度條)
| 使用率範圍 | 顏色 | 狀態 | 描述 |
|------------|------|------|------|
| 0-60% | 🟢 綠色 | 正常 | 系統運行正常 |
| 60-80% | 🟡 黃色 | 警告 | 中等負載，需密切監控 |
| 80-100% | 🔴 紅色 | 危險 | 高負載，可能影響性能 |

#### VRAM 四階顏色系統 (更細緻的記憶體監控)
| 使用率範圍 | 顏色 | 狀態 | 描述 |
|------------|------|------|------|
| 0-40% | 🟢 綠色 | 最佳 | 充足的 VRAM 可用 |
| 40-60% | 🔵 青色 | 中等 | 活躍工作流程的正常使用 |
| 60-80% | 🟡 黃色 | 警告 | 高 VRAM 使用率 |
| 80-100% | 🔴 紅色 | 危險 | VRAM 耗盡，性能受影響 |

#### 顯示格式
- **CPU**: `M4 Max (16 cores)` - 顯示處理器型號和核心數
- **GPU**: `40 cores • 8% VRAM` - 只顯示核心數避免重複，VRAM 使用彩色顯示
- **MEM**: `19.3/128.0 GB` - 已使用/總計記憶體

#### Apple Silicon 支援的 GPU 核心數
- **M1**: 7-8 (基本), 14-16 (Pro), 24-32 (Max), 48-64 (Ultra)
- **M2**: 8-10 (基本), 16-19 (Pro), 30-38 (Max), 60-76 (Ultra) 
- **M3**: 8-10 (基本), 14-18 (Pro), 30-40 (Max)
- **M4**: 10 (基本), 16-20 (Pro), 32-40 (Max)

系統會自動從 `system_profiler SPDisplaysDataType` 偵測實際核心數和晶片型號。

## 程式碼重構規範

### 檔案大小限制
- **500 行規則**：任何檔案超過 500 行時必須進行重構
- **檢測工具**：使用 `aitools lines` 檢測超標檔案
- **配置排除**：可在 `.aitools/config.toml` 中設定例外：
  ```toml
  [ignore]
  lines = ["**/*.test.ts", "docs/**"]  # 排除測試和文件
  ```

### 重構前準備
- **備份優先**：重構前必須先備份原檔案為 `.bak`（如：`LineBotService.ts.bak`）
- **理解邏輯**：完整閱讀原始檔案，理解每個函數的職責和相依性
- **規劃拆分**：根據職責單一原則規劃模組拆分策略

### 檔案架構組織
當元件需要拆分為多個子模組時，建立專屬資料夾統整：

**範例：`group-card.tsx` 重構為 `group-card/` 資料夾**
```
group-card/
├── index.tsx              # 主元件邏輯（對外介面）
├── components/            # 子元件
│   ├── InviteSettings.tsx
│   └── MembershipDisplay.tsx
├── types.ts              # 共用型別定義
├── utils.ts              # 輔助函數
└── styles.ts             # 樣式常數（如 styled-components）
```

**資料夾組織原則**：
- **主檔案 (`index.tsx`)**：作為對外介面，匯出主要功能
- **子元件 (`components/`)**：UI 元件拆分，每個檔案職責單一
- **型別定義 (`types.ts`)**：集中管理共用介面和型別
- **工具函數 (`utils.ts`)**：純函數邏輯，易於測試
- **樣式 (`styles.ts`)**：分離樣式邏輯，提升可維護性

### 重構後驗證

#### 1. 邏輯驗證
- **比對原檔**：與 `.bak` 檔案比對，確保所有方法都已正確遷移
- **功能一致性**：驗證每個函數的輸入輸出與原檔完全相同
- **相依性檢查**：確認模組間的依賴關係正確

#### 2. 引用檢查（必須執行）
使用工具全域搜尋並更新所有引用點：

```bash
# 搜尋舊類別/函數名稱
aitools grep "OldClassName" --output content

# 檢查所有 import 語句
aitools grep "from.*old-file" --output content
```

**檢查清單**：
- [ ] 所有 `import` 語句已更新路徑
- [ ] 服務注入和依賴注入正確（如 NestJS 的 `@Injectable()`）
- [ ] API 路由中的呼叫路徑已更新
- [ ] 型別引用已指向新位置
- [ ] 測試檔案的 import 已更新

#### 3. 測試指引
重構完成後必須明確告知用戶需要測試的互動場景：

**提供給用戶的測試清單範例**：
```markdown
## 測試指引

### 受影響的功能
- 群組卡片顯示與互動
- 成員邀請設定
- 會員資格顯示

### 測試步驟
1. 開啟群組列表頁面
2. 點擊任一群組卡片
3. 驗證以下功能：
   - 卡片資訊正確顯示
   - 邀請設定可正常開關
   - 成員列表正確載入

### 預期結果
- 所有 UI 互動正常運作
- 資料顯示與重構前一致
- 無 console 錯誤訊息

### 資料驗證
# 查詢資料庫確認資料完整性
SELECT * FROM groups WHERE id = 'test-group-id';
```

### 分離原則
- **單一職責**：每個檔案只負責一個明確的功能
- **高內聚低耦合**：相關邏輯放在一起，減少模組間依賴
- **可測試性**：拆分後的函數應易於單元測試
- **可讀性優先**：寧願多幾個小檔案，也不要一個複雜的大檔案

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