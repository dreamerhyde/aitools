# Q/A Display Styles Showcase

The monitor command now supports multiple visual styles for displaying Questions and Answers in session boxes. Here are the available styles:

## ⭐ RECOMMENDED: Hybrid Style (Default)
```
┌─────────────────────────────┐
│ [Q] How to fix this bug?    │  <- Cyan background badge + cyan text
│     with multiple lines...   │
│                             │
│ → Let me check the code     │  <- White arrow + white text
│   and find the issue...    │
│                             │
│ [Q] Can you run tests?      │  <- Clear Q identification
│                             │
│ → Running tests now...      │  <- Clean A response
└─────────────────────────────┘
```
**Features:**
- **Best of both worlds**: Q gets prominent badge, A gets clean arrow
- **Visual hierarchy**: Questions stand out, answers flow naturally
- **Color coding**: Q in cyan (both bg and text), A in white
- **Clean design**: No unnecessary separators
- **Optimal readability**: Clear distinction without clutter

## 1. Badge Style (Default) - MOST DISTINCTIVE
```
┌─────────────────────────────┐
│ [Q] How to fix this bug?    │  <- Cyan background badge
│                             │
│ [A] Let me check the code   │  <- Green background badge
│     and find the issue...   │
│ ──────────────────          │  <- Gray separator line
│                             │
│ [Q] Can you run tests?      │
│                             │
│ [A] Running tests now...    │
└─────────────────────────────┘
```
**Features:**
- Colored background badges (Q=cyan, A=green)
- High contrast for easy identification
- Separator lines between Q/A pairs
- Best for quick visual scanning

## 2. Icon Style - MODERN & CLEAN
```
┌─────────────────────────────┐
│ ▶ Q: How to fix this bug?  │  <- Arrow icon + cyan text
│                             │
│ ▷ A: Let me check the code │  <- Hollow arrow + white text
│      and find the issue... │
│   · · ·                     │  <- Dot separator
│                             │
│ ▶ Q: Can you run tests?    │
│                             │
│ ▷ A: Running tests now...  │
└─────────────────────────────┘
```
**Features:**
- Unicode arrow icons
- Clean, minimal design
- Subtle dot separators
- Good for modern terminals

## 3. Bracket Style - TRADITIONAL
```
┌─────────────────────────────┐
│ [Q] How to fix this bug?   │  <- Cyan bracketed Q
│                             │
│ [A] Let me check the code  │  <- Green bracketed A
│     and find the issue...  │
│                             │
│ [Q] Can you run tests?     │
│                             │
│ [A] Running tests now...   │
└─────────────────────────────┘
```
**Features:**
- Square brackets with colors
- Traditional terminal style
- No separators for cleaner look
- Familiar to CLI users

## 4. Arrow Style - DIRECTIONAL
```
┌─────────────────────────────┐
│ → How to fix this bug?     │  <- Right arrow for questions
│                             │
│ ← Let me check the code    │  <- Left arrow for answers
│   and find the issue...    │
│                             │
│ → Can you run tests?       │
│                             │
│ ← Running tests now...     │
└─────────────────────────────┘
```
**Features:**
- Directional arrows show conversation flow
- Minimal but effective
- Question flows right, answer flows left
- Intuitive conversation direction

## 5. Minimal Style - SUBTLE
```
┌─────────────────────────────┐
│ • How to fix this bug?     │  <- Bullet for questions (cyan)
│                             │
│   Let me check the code    │  <- Indented answers (white)
│   and find the issue...    │
│                             │
│ • Can you run tests?       │
│                             │
│   Running tests now...     │
└─────────────────────────────┘
```
**Features:**
- Ultra-minimal design
- Uses indentation for hierarchy
- Bullets for questions only
- Best for distraction-free viewing

## Color Schemes

In addition to styles, different color schemes are available:

### Default (Cyan/Green)
- Questions: Cyan
- Answers: Green  
- Best for: General use, good contrast

### Ocean (Blue/Cyan)
- Questions: Blue
- Answers: Cyan
- Best for: Blue-tinted terminals

### Warm (Yellow/Magenta)
- Questions: Yellow
- Answers: Magenta
- Best for: High visibility

### Monochrome (White/Gray)
- Questions: White
- Answers: Gray
- Best for: Minimalist setups

### High Contrast (Yellow/White)
- Questions: Yellow (bright)
- Answers: White (bright)
- Best for: Accessibility, poor lighting

## Usage

The default style is **Badge** which provides the best visual distinction between Q and A.

To change styles programmatically:
```typescript
// In session-boxes-view.ts
sessionBoxesView.setQAStyle(QAStyleType.ICON);

// Or cycle through styles
sessionBoxesView.cycleQAStyle();
```

## Recommendations

1. **For Quick Scanning**: Use Badge style (default)
2. **For Modern Look**: Use Icon style
3. **For Traditional CLI**: Use Bracket style
4. **For Conversation Flow**: Use Arrow style
5. **For Minimal Distraction**: Use Minimal style

The Badge style is recommended as default because:
- Highest visual distinction between Q and A
- Easy to scan quickly
- Works well in all terminal themes
- Clear separation between conversation pairs