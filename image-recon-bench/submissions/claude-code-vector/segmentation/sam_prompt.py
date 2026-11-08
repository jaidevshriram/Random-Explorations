"""Prompted SAM 2.1: one mask per named piece from points/boxes I choose by eye.

    python sam_prompt.py prompts.json out.npz

prompts.json: [{"name": "...", "pos": [[x, y], ...], "neg": [[x, y], ...], "box": [x0, y0, x1, y1]}, ...]
(any of pos/neg/box may be omitted). The image embedding is computed once and cached.
"""

import json
import os
import sys

import numpy as np
import torch
from PIL import Image
from transformers import Sam2Model, Sam2Processor

D = os.path.dirname(os.path.abspath(__file__))
IMG = "/home/user/Random-Explorations/image-recon-bench/images/lego_r19.png"
MODEL = "facebook/sam2.1-hiera-large"
torch.set_num_threads(4)

img = Image.open(IMG).convert("RGB")
proc = Sam2Processor.from_pretrained(MODEL)
model = Sam2Model.from_pretrained(MODEL).eval()
cache = os.path.join(D, "embedding.pt")
base = proc(images=img, return_tensors="pt")
if os.path.exists(cache):
    emb = torch.load(cache)
else:
    with torch.no_grad():
        emb = model.get_image_embeddings(base["pixel_values"])
    torch.save(emb, cache)

prompts = json.load(open(sys.argv[1]))
masks, scores, names, alts = [], [], [], []
for p in prompts:
    pts = [list(map(float, q)) for q in p.get("pos", [])] + [list(map(float, q)) for q in p.get("neg", [])]
    lbl = [1] * len(p.get("pos", [])) + [0] * len(p.get("neg", []))
    kw = {}
    if pts:
        kw["input_points"] = [[pts]]
        kw["input_labels"] = [[lbl]]
    if p.get("box"):
        kw["input_boxes"] = [[list(map(float, p["box"]))]]
    inputs = proc(images=img, return_tensors="pt", **kw)
    with torch.no_grad():
        out = model(image_embeddings=emb, multimask_output=True,
                    **{k: inputs[k] for k in ("input_points", "input_labels", "input_boxes") if k in inputs})
    m = proc.post_process_masks(out.pred_masks, inputs["original_sizes"])[0][0].numpy() > 0  # (3, H, W)
    iou = out.iou_scores[0, 0].numpy()
    # prefer the highest predicted IoU; ties broken toward the smaller mask (a single piece)
    order = sorted(range(len(iou)), key=lambda i: (-round(float(iou[i]), 2), m[i].sum()))
    k = order[0] if p.get("pick") is None else int(p["pick"])
    masks.append(m[k]); scores.append(float(iou[k])); names.append(p["name"])
    alts.append(m)
    print(f"{p['name']:<28} iou {iou[k]:.2f}  area {m[k].sum():6d}  (alts {[int(x.sum()) for x in m]})", flush=True)
np.savez_compressed(sys.argv[2], masks=np.stack(masks), scores=np.array(scores), names=np.array(names), alts=np.stack(alts))
