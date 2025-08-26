# Text Sanitizer Usage Guide

The `text-sanitizer` utility provides abstract methods for removing and converting emojis in conversation content, following the project's visual design principles.

## Core Functions

### `sanitizeText(text, options)`
Main function for sanitizing any text content.

```typescript
import { sanitizeText } from '../utils/text-sanitizer.js';

// Basic usage - removes emojis and converts to ASCII
const clean = sanitizeText("Hello 🌍!", {
  removeEmojis: true,
  convertToAscii: true
});
// Result: "Hello !"

// With length limit
const truncated = sanitizeText("Very long text...", {
  maxLength: 50
});
```

### `sanitizeConversationMessages(messages)`
Specifically designed for cleaning conversation arrays in session displays.

```typescript
import { sanitizeConversationMessages } from '../utils/text-sanitizer.js';

const messages = [
  { role: 'user', content: 'Fix bug 🐛', timestamp: new Date() },
  { role: 'assistant', content: 'Done! ✅', timestamp: new Date() }
];

const clean = sanitizeConversationMessages(messages);
// Results:
// - 'Fix bug [bug]'
// - 'Done! [OK]'
```

### `formatActionString(action)`
For formatting action status strings (like "Puttering...").

```typescript
import { formatActionString } from '../utils/text-sanitizer.js';

const action = formatActionString("Building 🔨");
// Result: "Building [build]"
```

### `sanitizeTopic(topic, maxLength)`
For cleaning and truncating topic/title strings.

```typescript
import { sanitizeTopic } from '../utils/text-sanitizer.js';

const topic = sanitizeTopic("Deploy app 🚀 to production", 30);
// Result: "Deploy app ^ to production"
```

## Integration Examples

### In Session Views
```typescript
// session-boxes-view.ts
import { sanitizeText, formatActionString } from '../utils/text-sanitizer.js';

// Clean message content
const cleanContent = sanitizeText(msg.content, {
  removeEmojis: true,
  convertToAscii: true,
  preserveWhitespace: false
});

// Format action display
if (session.currentAction) {
  const sanitizedAction = formatActionString(session.currentAction);
  contentLines.push(`* ${sanitizedAction}... (esc to interrupt)`);
}
```

### In Session Utils
```typescript
// session-utils.ts
import { sanitizeText, sanitizeTopic, formatActionString } from './text-sanitizer.js';

// Clean user input
content = sanitizeText(content.trim(), {
  removeEmojis: true,
  convertToAscii: true,
  preserveWhitespace: false
});

// Format topic for display
display = sanitizeTopic(lastUserMsg.content, 100);

// Format tool action
currentAction = formatActionString(toolActions[item.name]);
```

## Emoji Mappings

Common emoji conversions follow project standards:

| Emoji | ASCII | Usage |
|-------|-------|-------|
| 😀 😁 | `:)` `:D` | Emotions |
| ❤️ 💔 | `<3` `</3` | Hearts |
| 👍 👎 | `+1` `-1` | Feedback |
| ✅ ❌ | `[OK]` `[X]` | Status |
| 🐛 🔨 | `[bug]` `[build]` | Development |
| 📈 📉 | `↗` `↘` | Trends |
| 🚀 ⚡ | `^` `!` | Speed/Action |

## Options Reference

### SanitizeOptions
```typescript
interface SanitizeOptions {
  removeEmojis?: boolean;      // Remove remaining emojis after conversion
  convertToAscii?: boolean;    // Convert known emojis to ASCII
  maxLength?: number;          // Truncate to max length
  preserveWhitespace?: boolean; // Keep original whitespace
}
```

## Helper Functions

- `hasEmojis(text)` - Check if text contains emojis
- `countEmojis(text)` - Count number of emojis
- `extractEmojis(text)` - Extract all unique emojis

## Best Practices

1. Always sanitize user-generated content before display
2. Use specific functions for their intended purpose (e.g., `sanitizeConversationMessages` for chat)
3. Apply sanitization at the presentation layer, not storage
4. Preserve original data, only sanitize for display

## Performance Notes

- Sanitization is fast but should be cached for frequently displayed content
- Consider memoization for large conversation histories
- The regex patterns are optimized for common emoji ranges