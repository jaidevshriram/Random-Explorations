# Video explainer

`regression_vs_classification.mp4` is a 6.1-minute animation narrated with the ElevenLabs "Chris" voice over an original ambient piano track, made with [manim](https://www.manim.community/) in the style of 3Blue1Brown. It walks through the whole experiment:

1. **Intro**: regression vs. bins for one coordinate of a vector shape.
2. **L2 = springs**: the prediction settles at the mean, which falls in the gap when the labels are bimodal. Includes the loss "bowl".
3. **L1 = ropes**: a vote, so it settles at the median. At 50/50 the loss is flat and the prediction drifts. Then: how hard each loss pushes.
4. **Bins**: each label raises only its own bin, so both peaks grow and there is no tug of war. Also covers soft (HL-Gauss) labels.
5. **Decoding**: argmax picks a real answer. The expected value is the histogram's balance point, which is the mean again. Best recipe: take the peak, then average inside it.
6. **Real results** from `experiment.py`: L2 and L1 lines and the bin head's predicted density.
7. **Coarse-to-fine bins**: with the fine level conditioned on the coarse one, it is the same as one big softmax. With a shared fine level, one mode borrows the other mode's offset.
8. **Letter O (2D)**: L2 draws a phantom ring. With separate softmaxes for x and y, the product puts mass on ghost points; a joint softmax removes them.
9. **Back to SVG and Hungarian matching**, then a summary.

## Re-rendering

```bash
pip install manim faster-whisper   # plus LaTeX (texlive-latex-extra), ffmpeg, libpango1.0-dev
export ELEVENLABS_API_KEY=...       # needs text-to-speech permission
python make_video.py                # 1080p30, ~4 min on 4 cores
python make_video.py --quality low --scenes S05_Decode   # quick preview of one scene
python make_video.py --voice piper  # free offline voice instead (pip install piper-tts)
python make_video.py --no-music
```

- `narration.py`: the script. Each beat is one TTS clip, and the scenes sync their animations to the clip lengths. Edit the text and re-run; only changed clips (and their neighbours) are regenerated.
- ElevenLabs clips are sent with the neighbouring lines as context so the intonation flows. Each new clip is transcribed with Whisper and regenerated if it contains extra speech, since ElevenLabs occasionally repeats the end of a sentence.
- `music.py`: original background music, synthesised from code (a slow piano arpeggio in D major over a soft pad, with reverb), so there is nothing to license. In the mix the narration is loudness-normalised to -16 LUFS, and the music sits about 12 dB under it, ducking further while the voice is speaking.
- `scenes.py`: one manim scene per section.
- `video_data.npz`: trained-model outputs used in scenes 6 and 8. It is regenerated from `../logs.pkl` if that file exists.
