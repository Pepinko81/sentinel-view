# Keynote UI Screenshot Instructions

## Apple Keynote-Grade UI Screenshots

After applying the Keynote theme, generate screenshots of the following pages:

### Required Screenshots

1. **Dashboard** (`keynote_dashboard.png`)
   - Navigate to: `http://localhost:5173/` (or your dev server)
   - Capture the full dashboard view showing:
     - Animated canvas background (moving gradients)
     - Floating glass stat cards with neon glow numbers
     - Light streak overlay effect
     - Categories section with glass badges
     - System info panel

2. **Jails/Bans** (`keynote_bans.png`)
   - Navigate to: `http://localhost:5173/jails`
   - Capture the jails table showing:
     - Floating glass table container
     - Glass tabs with active state
     - Translucent table rows
     - Filter section

3. **Live Logs** (`keynote_logs.png`)
   - Navigate to: `http://localhost:5173/logs`
   - Capture the live log window showing:
     - Premium glass log container
     - Real-time log streaming
     - Connection status with neon indicators

### Screenshot Requirements

- **Resolution**: Minimum 1920x1080 (Full HD), preferably 2560x1440
- **Format**: PNG with transparency support
- **Browser**: Chrome/Edge (best backdrop-filter support)
- **View**: Full page capture or main content area
- **Timing**: Wait for animations to load (2-3 seconds)

### Visual Checklist

Before capturing, ensure:
- ✅ Animated canvas background is visible (moving gradients)
- ✅ Glass blur effects are prominent (32px+ blur)
- ✅ Neon cyan accents are glowing (#3af0ff)
- ✅ Light streak overlay is pulsing
- ✅ Cards are floating (translateY -2px idle, -6px hover)
- ✅ Numbers have neon glow effect
- ✅ Buttons have cyan glow shadows
- ✅ Sequential fade-in animations are working
- ✅ All glass panels have proper transparency

### Quick Capture Methods

**Chrome DevTools:**
1. Open DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Set to Desktop view (1920x1080 or higher)
4. Wait for animations to stabilize
5. Use browser screenshot extension

**Browser Extensions:**
- Full Page Screen Capture (Chrome)
- Awesome Screenshot (Chrome/Firefox)
- Nimbus Screenshot (Chrome/Firefox)

**Command Line (Linux):**
```bash
# Using Chrome/Chromium headless
chromium-browser --headless --disable-gpu \
  --screenshot=keynote_dashboard.png \
  --window-size=1920,1080 \
  http://localhost:5173/

# Wait 3 seconds for animations
sleep 3
chromium-browser --headless --disable-gpu \
  --screenshot=keynote_bans.png \
  --window-size=1920,1080 \
  http://localhost:5173/jails

sleep 3
chromium-browser --headless --disable-gpu \
  --screenshot=keynote_logs.png \
  --window-size=1920,1080 \
  http://localhost:5173/logs
```

### File Locations

Save screenshots to:
- `/docs/screenshots/keynote_dashboard.png`
- `/docs/screenshots/keynote_bans.png`
- `/docs/screenshots/keynote_logs.png`

### Post-Processing (Optional)

For best results:
- Ensure canvas animation is captured (may need video → frame extraction)
- Verify glass blur is visible in screenshot
- Check neon glow effects are prominent
- Confirm light streaks are visible

