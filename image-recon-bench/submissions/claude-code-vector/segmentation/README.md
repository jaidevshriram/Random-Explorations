# Piece segmentation for lego_r19

`pieces.png` is a 16-bit label map of the reference (0 = background or not
segmented, k = piece k) and `pieces.json` lists the pieces. `vectorize.py`
builds the SVG on top of it, so the SVG's pieces are only as good as this map.

## How it was made

1. **Automatic SAM 2.1 masks** (`run_sam.py`, `run_sam_dense.py`):
   `facebook/sam2.1-hiera-large` through the Hugging Face `transformers`
   mask-generation pipeline on CPU, once with one layer of crops and once with
   two (21 crop windows), 437 masks in total.
2. **Prompted masks** (`sam_prompt.py`, `prompts1.json`, `prompts2.json`): for
   pieces the automatic pass missed or merged, I placed positive/negative points
   or a box by eye on zoomed crops, looked at SAM's three alternatives for each
   (`altsheet.py`) and kept the one matching the real piece (`picks.json`).
   Prompts with no good alternative were dropped.
3. **Hierarchy and partition** (`pieces.py`): masks are de-duplicated, each
   mask's parent is the smallest larger mask containing it, a mask whose
   children cover most of it is an assembly, a mask directly under an
   assembly (or under nothing) is a piece, and anything inside a piece (a hole,
   a stud) is a sub-part. Prompted masks are always pieces. Where pieces
   overlap, the smaller one wins.

Result: 124 pieces (99 automatic, 25 prompted) covering 91% of the model's
pixels. The vectorizer keeps the remaining 9% as an explicit "unsegmented"
piece per object.

Running steps 1–2 needs `torch`, `transformers` and about 1 GB of model
weights; `pieces.py` paths point at the scratch directory used when it was made.

## Known problems

- Some touching same-colour pieces are still merged or split: the brown
  edging bricks along the plate's front were only partly separable, and a few
  yellow structures behind the boom are one mask.
- The bucket floor and some slivers between beams are unsegmented.
- Piece kinds on automatic masks ("beam", "connector or pin", ...) are guesses
  from colour and shape; the bucket's tooth plates, for example, are labelled
  "beam" because they are long and thin.
- Objects (bucket, cab, ...) are assigned from hand-drawn regions, so a piece
  on a boundary can land in the neighbouring object.
