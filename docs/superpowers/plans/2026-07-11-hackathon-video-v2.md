# Hackathon Demo Video V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a revised 60-second hackathon film with standard Mandarin narration and real visual proof of skills, Laojun forging, and in-level two-player co-op.

**Architecture:** Keep the existing HyperFrames composition and public watch page. Extend the Playwright canvas-capture scripts to deterministically produce three proof clips, replace the narration master, retime the affected HyperFrames scenes, then render, deploy, and push the curated sources.

**Tech Stack:** Phaser game runtime, Playwright, MediaRecorder, FFmpeg, Edge neural TTS, HyperFrames 0.7.49, Git/GitHub.

---

### Task 1: Deterministic Feature Capture

**Files:**
- Modify: `videos/zaixu-hackathon/record/capture-final.mjs`
- Modify: `videos/zaixu-hackathon/record/capture-coop.mjs`
- Create: `videos/zaixu-hackathon/media/gameplay/skill-combat.mp4`
- Create: `videos/zaixu-hackathon/media/gameplay/laojun-forge.mp4`
- Create: `videos/zaixu-hackathon/media/gameplay/coop-battle.mp4`

- [ ] **Step 1: Add deterministic state setup for the three captures**

Use the game's existing debug seams (`__giveMaterials`, skill-tree save state, room invite URL, and battle teleport helpers) only to reach the state; all actions shown in the final footage must use normal visible UI or keyboard controls.

- [ ] **Step 2: Record skill and Laojun proof clips**

Run:

```bash
cd videos/zaixu-hackathon
npm run capture:gameplay
```

Expected: `skill-combat.mp4` contains a visible cast and hit; `laojun-forge.mp4` contains dialogue, forge result, and inventory proof.

- [ ] **Step 3: Record a real two-session battle**

Run:

```bash
cd videos/zaixu-hackathon
npm run capture:coop
```

Expected: `coop-battle.mp4` visibly contains two different player sprites in the same level after both sessions joined the same room.

- [ ] **Step 4: Inspect clip metadata and representative frames**

Run `ffprobe` on all three files and extract start/middle/end JPEG frames with `ffmpeg`. Expected: 1920x1080, 60 fps, no blank frames, and readable UI.

### Task 2: Standard Mandarin Narration

**Files:**
- Modify: `videos/zaixu-hackathon/SCRIPT.md`
- Modify: `videos/zaixu-hackathon/narration.txt`
- Modify: `videos/zaixu-hackathon/narration.wav`
- Modify: `videos/zaixu-hackathon/transcript.json`

- [ ] **Step 1: Rewrite narration around the proof shots**

Keep the script within 52-55 seconds of speech and explicitly mention skills, Laojun's real result, and joining a live battle through a link.

- [ ] **Step 2: Generate a mainland Mandarin neural voice master**

Run Edge TTS with a `zh-CN` neural voice, then normalize to 48 kHz stereo PCM WAV using FFmpeg. Expected: neutral standard Mandarin with no Taiwanese or Cantonese prosody.

- [ ] **Step 3: Generate timing data and audio checks**

Update `transcript.json` from the new narration timing. Check peak level, duration, and silence with `ffmpeg` filters; expected: no clipping and no unexplained silence over 1.5 seconds.

### Task 3: HyperFrames Recut

**Files:**
- Modify: `videos/zaixu-hackathon/STORYBOARD.md`
- Modify: `videos/zaixu-hackathon/index.html`
- Modify: `videos/zaixu-hackathon/public/poster.jpg`

- [ ] **Step 1: Replace claim-only scenes with proof footage**

Wire `skill-combat.mp4`, `laojun-forge.mp4`, and `coop-battle.mp4` into timed `.clip` elements. Remove the static AI furnace proof list and retime the middle section to the accepted design.

- [ ] **Step 2: Update motion and labels**

Keep labels short (`技能实战`, `材料扣除 · 装备入包`, `双人同场`) and place them clear of game HUD and dialogue surfaces.

- [ ] **Step 3: Run HyperFrames checks**

Run:

```bash
cd videos/zaixu-hackathon
npm run check
```

Expected: lint, validation, and layout inspection complete with zero errors.

- [ ] **Step 4: Render and visually inspect**

Run `npm run render`, extract a contact sheet, and inspect the opening, skill, forging, co-op, and final-link frames. Expected: no blank media, overlaps, unreadable labels, or mismatched narration.

### Task 4: Publish And Push

**Files:**
- Modify: `videos/zaixu-hackathon/public/index.html` only if metadata changes
- Modify: `README.md` only if the public video metadata changes

- [ ] **Step 1: Verify final media contract**

Use `ffprobe` to confirm H.264 1920x1080 60 fps video, AAC 48 kHz stereo audio, and approximately 60 seconds duration.

- [ ] **Step 2: Deploy the watch page and MP4**

Copy the public assets and rendered MP4 to the existing `/demo/` deployment. Expected: watch page returns HTTP 200 and byte-range MP4 request returns HTTP 206.

- [ ] **Step 3: Commit and push**

Stage only the revised video source, curated clips, documentation, poster, and relevant README changes. Run `git diff --cached --check`, commit in English, and push `HEAD:master` to `origin`.

- [ ] **Step 4: Verify the remote**

Confirm `origin/master` matches local `HEAD`, GitHub remains public, raw README returns HTTP 200, and the public watch page loads the revised video metadata.
