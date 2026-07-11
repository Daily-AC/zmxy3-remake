# Hackathon Demo Video V2 Design

## Objective

Revise the existing 60-second hackathon film so every important claim is backed by visible gameplay. The new cut must keep the current visual identity while replacing the weak proof points identified after reviewing the first public version.

## Accepted Direction

The user approved continuing with four concrete corrections:

1. Replace the accented TTS with natural standard Mandarin.
2. Show two players inside the same live battle, not only the room-creation UI.
3. Show the Taishang Laojun conversation, material consumption, forge result, and resulting inventory item.
4. Show at least one learned skill being cast and visibly affecting enemies.

## Narrative Structure

The film remains a 16:9, 60-second product demonstration. Its middle is rebuilt as an evidence chain:

- `0-12s`: identity, browser revival, world map.
- `12-22s`: normal combat followed by an unmistakable active-skill cast.
- `22-34s`: equipment progression, Laojun interaction, forge action, and result.
- `34-47s`: share-link room flow followed by two characters fighting in the same level.
- `47-60s`: two playable chapters, complete loop, public play and source links.

The narration describes only what the current shot proves. Short labels may identify a feature, but must not substitute for recorded behavior.

## Capture Requirements

### Skill proof

- Record the game canvas at 1920x1080 and 60 fps.
- Seed or learn one implemented Wukong active skill and bind it to a visible key slot.
- Capture the skill animation, hit effect, MP change, and damage number in a single continuous shot.

### Laojun proof

- Start with sufficient visible materials and bag space.
- Capture the Laojun portrait/dialogue and a real forge request.
- Preserve the result message long enough to read.
- End on inventory state showing the produced equipment and changed material count.

### Co-op proof

- Use two distinct authenticated browser sessions.
- Create a room as host and join through the generated invite URL as guest.
- Ready both players, start the level, and record one canvas where both character sprites are visible and moving or attacking.
- The room UI may appear briefly, but in-level co-op is the proof shot.

## Audio Direction

Generate the final narration with a mainland Mandarin neural voice. Use moderate pace, neutral news-documentary diction, and no regional prosody. Keep the current music and game SFX, ducked under speech. Verify the final waveform has no clipping and no unexplained silence longer than 1.5 seconds.

## Delivery And Verification

- HyperFrames lint, validate, and layout inspection report zero errors.
- Contact-sheet review confirms every shot is framed and legible.
- Final MP4 is H.264, 1920x1080, 60 fps, with AAC stereo audio.
- The public demo page and direct MP4 URL are replaced atomically and return HTTP 200/206.
- Source changes, curated clips, README metadata, and watch-page poster are committed and pushed to GitHub `master`.
