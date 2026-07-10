# 《再续西游》Hackathon Demo Storyboard

## Delivery

- Resolution: 1920x1080
- Frame rate: 60 fps
- Duration: 60 seconds
- Spoken language: Mandarin Chinese
- Visual rule: real gameplay is the proof; generated menu/loading art only frames the opening, chapter changes, and close.

## Asset Audit

| Asset | Role | Status |
| --- | --- | --- |
| `media/stills/menu-keyart.jpg` | Opening and closing hero image | Approved |
| `media/stills/login.png` | Browser login proof | Approved |
| `media/stills/character-select.png` | Original character-selection proof | Approved |
| `media/gameplay/world-map.mp4` | Playable world map | Approved, 1080p60 |
| `media/gameplay/nine-heavens-combat.mp4` | L1 weapon, damage and combo proof | Approved, trim to the attack window |
| `media/gameplay/tiangongdao-combat.mp4` | L2 monsters, pursuit and attack proof | Approved |
| `media/gameplay/backpack-equipment.mp4` | Stats and equipment UI | Approved |
| `media/gameplay/furnace.mp4` | Recipe and forging UI | Approved |
| `media/gameplay/coop-room.mp4` | Room creation, ready state and share entry | Approved |
| `media/stills/loading-nine-heavens.webp` | Chapter divider / L1 identity | Approved |
| `media/stills/loading-heavenly-palace.webp` | Chapter divider / L2 identity | Approved |
| `narration.wav` | Narration master | Approved, 54.590542s |
| `media/audio/bg1.mp3` | Music bed | Approved, 60.551875s |
| `media/audio/Role1_hit1AndHit2.mp3` | Combat accents | Approved |
| `media/audio/Role1_hit5.mp3` | Heavy combat accent | Approved |
| `media/audio/pickup.mp3` | Progression accent | Approved |
| `media/audio/Game_Victory.mp3` | Closing sting | Approved |

## Beats

### 0.00-5.96 - Hook: Memory Reignited

- Full-bleed menu key art with a slow 103% camera push.
- Project title lands in brush type; ember streaks and a small vermilion seal establish the homepage identity.
- On-screen line: `童年的页游，重新活过来。`
- Transition out: fast warm overexposure followed by a vertical vermilion ink wipe.

### 5.96-15.37 - Revival: Old Logic, Modern Browser

- 5.96-8.80: login scroll, cropped close enough to show that the project is an actual browser experience.
- 8.80-11.60: Wukong character selection, with locked companions still visible.
- 11.60-15.37: moving world-map capture.
- Proof rail: `旧资源 × 原始逻辑 × 现代浏览器`.
- Transition out: gold edge flash timed to narration emphasis on “战斗”.

### 15.37-23.65 - Combat: Every Hit Has Rhythm

- 15.37-18.20: Nine Heavens attack window, trimmed from 0.65s. Show weapon overlay, damage numbers, level-up and combo feedback.
- 18.20-23.65: Heavenly Palace combat. Keep Wukong and the three turtle soldiers visible together.
- Feature stamps: `伤害` / `追击` / `反击`.
- SFX: two light hit accents and one heavy hit accent under narration.
- Transition out: horizontal brush stroke wiping from weapon motion.

### 23.65-30.57 - Progression: Gear Changes the Run

- 23.65-26.85: backpack and numerical stats, with a small weapon material icon rail.
- 26.85-30.57: furnace recipe UI; material icons converge toward the recipe row.
- Proof rail: `装备影响属性 · 材料真实扣除 · 产物回到背包`.
- SFX: pickup accent at the cut into the forge.

### 30.57-44.50 - Co-op and AI: Share, Join, Forge

- 30.57-36.67: actual co-op room capture from selector to created room, ready state, and share entry.
- 36.67-44.50: furnace visual becomes the stage for three short AI proof statements: `理解材料`, `判断配方`, `返回炼制结果`.
- Primary callout: `链接直达房间`.
- Supporting callout: `AI 太上老君`.
- Transition out: red seal expands to cover frame, then reveals both chapter key arts.

### 44.50-54.59 - Close: A Complete Playable Loop

- Split chapter art for Nine Heavens and Heavenly Palace.
- Three factual counters arrive one by one: `2 个关卡`, `1 套成长循环`, `分享即联机`.
- Menu key art returns by 49.50s; narration closes over the playable build.

### 54.59-60.00 - Final Portal

- No narration. Music and victory sting carry the final title.
- Project name and the two public URLs stay fully legible for at least four seconds.
- Final text: `现在就能玩的西游`.
- Fade to shell black during the final 0.45s.

## Audio Mix

- Narration: 0 dB reference, centered.
- Music bed: 14% element volume, ducked visually rather than dynamically.
- Hit SFX: 35-45% element volume.
- Pickup SFX: 42% element volume.
- Victory sting: 55% element volume at 54.8s.
