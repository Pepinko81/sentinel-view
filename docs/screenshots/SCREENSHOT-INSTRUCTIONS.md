# Screenshot Generation Instructions

## Liquid Glass Ultra Theme Screenshots

After applying the Liquid Glass Ultra theme, generate screenshots of the following pages:

### Required Screenshots

1. **Dashboard** (`dashboard_glass_ultra.png`)
   - Navigate to: `http://localhost:5173/` (or your dev server)
   - Capture the full dashboard view showing:
     - Stat cards with neon glow numbers
     - Glass panels with blur effects
     - Categories section
     - System info panel

2. **Jails/Bans** (`bans_glass_ultra.png`)
   - Navigate to: `http://localhost:5173/jails`
   - Capture the jails table showing:
     - Glass table with translucent rows
     - Active tabs with glass styling
     - Filter section

3. **Live Logs** (`logs_glass_ultra.png`)
   - Navigate to: `http://localhost:5173/logs`
   - Capture the live log window showing:
     - Glass log container
     - Real-time log streaming
     - Connection status

### Screenshot Requirements

- **Resolution**: Minimum 1920x1080 (Full HD)
- **Format**: PNG with transparency support
- **Browser**: Chrome/Edge (best backdrop-filter support)
- **View**: Full page capture or main content area

### Quick Capture Methods

**Chrome DevTools:**
1. Open DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Set to Desktop view
4. Use browser screenshot extension or Cmd+Shift+S (Mac) / Ctrl+Shift+S (Windows)

**Browser Extensions:**
- Full Page Screen Capture (Chrome)
- Awesome Screenshot (Chrome/Firefox)
- Nimbus Screenshot (Chrome/Firefox)

**Command Line (Linux):**
```bash
# Using Firefox with headless mode
firefox --headless --screenshot dashboard_glass_ultra.png http://localhost:5173/

# Using Chrome/Chromium
chromium-browser --headless --disable-gpu --screenshot --window-size=1920,1080 dashboard_glass_ultra.png http://localhost:5173/
```

### File Locations

Save screenshots to:
- `/docs/screenshots/dashboard_glass_ultra.png`
- `/docs/screenshots/bans_glass_ultra.png`
- `/docs/screenshots/logs_glass_ultra.png`

### Visual Checklist

Before capturing, ensure:
- ✅ Glass blur effects are visible (24px+ blur)
- ✅ Neon cyan accents are prominent (#47E8FF)
- ✅ Light streak reflections visible on top of panels
- ✅ Hover effects work (cards lift on hover)
- ✅ Numbers have neon glow effect
- ✅ Background gradient is visible
- ✅ All glass panels have proper transparency

