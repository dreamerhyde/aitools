# Emoji 彩色轉換功能說明

## 功能概述
當使用者在 Claude Code 中發送包含 emoji 的訊息時，`aitools monitor` 會自動將這些 emoji 轉換成帶有顏色的 ASCII 符號。

## 實際效果

### 在 Active Sessions 視窗中

當你執行 `aitools monitor` 並查看 Active Sessions 時：

```
┌─ Active Sessions ─────────────┐
│ ● Active - aitools            │
│                               │
│ Q ✅ 完成了專案設置！         │
│                               │
│ > ✓ 完成了專案設置！          │
│   (✓ 會顯示為綠色)           │
│                               │
│ Q ❌ 發現錯誤了               │
│                               │
│ > ✗ 發現錯誤了                │
│   (✗ 會顯示為紅色)           │
└───────────────────────────────┘
```

## 轉換映射表

| Emoji | 轉換結果 | 顏色 |
|-------|---------|------|
| ✅ | ✓ | 綠色 |
| ❌ | ✗ | 紅色 |
| 🔴 | ● | 紅色 |
| 🟢 | ● | 綠色 |
| 🟡 | ● | 黃色 |
| 🔵 | ● | 藍色 |
| ⚠️ | ! | 黃色 |
| 🐛 | [bug] | 紅色 |
| 🧪 | [test] | 綠色 |
| 🔨 | [build] | 青色 |
| 📦 | [pkg] | 藍色 |

## 如何測試

1. **執行監控模式**
   ```bash
   ./dist/cli.js monitor
   ```

2. **在 Claude Code 中發送包含 emoji 的訊息**
   - 例如："✅ 任務完成了！"
   - 例如："❌ 測試失敗"
   - 例如："🟢 系統正常運行"

3. **觀察 Active Sessions 視窗**
   - Emoji 會自動轉換成對應的彩色符號
   - 顏色只在 blessed 視窗中可見

## 技術細節

### 為什麼一般測試看不到顏色？

- **Blessed 標記格式**：`{green-fg}✓{/green-fg}`
- 這種格式只有在 blessed 渲染引擎中才會被解析成顏色
- 在一般的 console.log 輸出中，這些標記會顯示為純文字

### 實作位置

- **映射表**：`/src/utils/text-sanitizer.ts`
  - `EMOJI_TO_PLAIN_ASCII`：無顏色版本
  - `EMOJI_TO_COLORED_ASCII`：彩色版本

- **使用位置**：`/src/commands/monitor/views/session-boxes-view.ts`
  ```typescript
  sanitizeText(content, {
    removeEmojis: true,
    convertToAscii: true,
    useColors: true  // 啟用彩色輸出
  })
  ```

## 測試程式

執行測試程式查看效果：
```bash
node test-emoji-colors.js
```

這會開啟一個 blessed 視窗，展示所有 emoji 的彩色轉換效果。