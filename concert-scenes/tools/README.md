# Tools

Offline helpers for turning the arena scene into video.

- `analyze_song.py in.wav out.json`: analyses a song (librosa) into a cue sheet: tempo, beats,
  downbeats, onsets, sections ranked by energy, and per-frame loudness and low/mid/high bands.
  Convert an mp3 first: `ffmpeg -i song.mp3 -ac 1 -ar 22050 song.wav`.
- `render-frames.js from to fps outDir [frameList] [programme]`: renders frames of the showcase
  (`main`, `beams`, or `song`) with headless Chromium, hand-made 15 fps style. For `song`, set
  `SONG=out.json` so the music programme can read the cue sheet. Frame `f` is time `f / fps`, so
  muxing the song from 0 keeps picture and sound in sync:

```
ffmpeg -framerate 15 -i frames/f%04d.jpg -i song.mp3 -map 0:v -map 1:a -c:v libx264 -pix_fmt yuv420p -crf 18 -c:a aac -b:a 192k -shortest out.mp4
```
