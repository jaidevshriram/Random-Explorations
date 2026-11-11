# Video explainer

> **Retraction (real-map follow-up).** This experiment shows what each loss does when *one* network output has to represent a genuinely ambiguous target. It does **not** show that bins beat regression in MapTR-style vector-map models. We tested that directly ([`maptr-mini/README.md`](maptr-mini/README.md)):
> - **MapTR-faithful model, synthetic data.** Clean labels: no reliable difference. Ambiguous labels: bins were worse, because L1 commits to one answer instead of averaging.
> - **Real Argoverse 2 maps with MapTRv2's own target construction.** L1 beat bins by a wide margin (pilot mAP 0.40 vs 0.16), with or without simulated occlusion. Three things did not close the gap: a higher bin-loss weight, a relative-bins head, or ruling out a bug (bins memorise 8 images better than L1 does).
>
> Treat the "bins win" conclusions below as a property of this toy setting only.

`regression_vs_classification.mp4` is a 10.6-minute animation narrated with the ElevenLabs "Chris" voice over an original ambient piano track, made with [manim](https://www.manim.community/) in the style of 3Blue1Brown. It walks through the whole experiment:

1. **Intro**: regression vs. bins for one coordinate of a vector shape, then a teaser: ambiguous labels, regression landing in the empty gap, bins showing two peaks.
2. **L2 = springs**: a net-pull arrow shows the springs cancelling at the mean, which falls in the gap when the labels are bimodal. Includes the loss "bowl".
3. **L1 = ropes**: a vote, so it settles at the median. At 50/50 the loss is flat and the prediction drifts. Then: how hard each loss pushes.
4. **Bins**: each label raises its own bin and takes probability from the others, so both peaks grow until the histogram matches the label frequencies. Also covers soft (HL-Gauss) labels.
5. **Decoding**: argmax picks a real answer. The expected value is the histogram's balance point, the mean again. A zoom shows argmax stuck on a bin centre while the local average lands on the true value: pick the peak, then average inside it.
6. **Real results** from `experiment.py`: each vertical slice of the x–y plot is one of the earlier number lines. A side panel follows one 50/50 slice while L2, three L1 training runs and the bin head are added. The final errors are bars: about 85× better than L2 and 20× better than L1, measured as distance to the nearest correct answer.
7. **Letter O (2D)**: the same four regions, one per quarter, and what L2 does in each. The bin head's strays lead into a zoom where separate x and y histograms create ghost points and a joint (x, y) histogram removes them.
8. **Coarse-to-fine bins**, motivated by the cost of that joint histogram (65,536 bins). With a fine histogram per coarse bin it equals one big softmax; a shared fine histogram can combine answer A's coarse bin with answer B's spot.
9. **Back to your SVG model**: Hungarian matching flips a query between two shapes, and regression averages them. Per-point bins alone can build a chimera (half circle, half square), so the points must be decoded together. Then a summary.

## Production notes

These came from an independent review and from research on what makes 3Blue1Brown-style explainers work. They're built into the pipeline:

- **Show, don't assert.** Every claim gets a visual (the net-pull arrow, three L1 runs, the argmax-vs-average zoom). Open with a concrete puzzle before any formula. These follow Grant Sanderson's "concrete before abstract" advice and Mayer's multimedia principles.
- **Colours keep one meaning:** grey = labels, red = L2, orange = L1, blue = bins/softmax, yellow = the prediction ŷ, green = correct/real, pink = ghosts. Answers A and B use neutral shades.
- **Automatic layout check:** after every animation, `NScene` flags text that leaves the frame or overlaps other text, and `make_video.py` prints the warnings. This addresses layout errors, the most common failure in AI-made manim videos (TheoremExplainAgent, Code2Video, OmniManim).
- **Music** stays at least 18 dB under the narration in pauses and more than 20 dB under it during speech (cf. WCAG 1.4.7).

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
- `music.py`: original background music, synthesised from code (a slow piano arpeggio in D major over a soft pad, with reverb), so there is nothing to license. In the mix the narration is loudness-normalised to -16 LUFS, and the music sits about 18 dB under it in pauses and more than 20 dB under it while the voice is speaking while the voice is speaking.
- `scenes.py`: one manim scene per section.
- `video_data.npz`: trained-model outputs used in scenes 6 and 8. It is regenerated from `../logs.pkl` if that file exists.
