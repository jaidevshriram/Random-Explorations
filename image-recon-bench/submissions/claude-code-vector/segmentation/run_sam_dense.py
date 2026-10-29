import time, numpy as np, torch
from PIL import Image
from transformers import pipeline
OUT = "/tmp/claude-0/-home-user-Random-Explorations/e6f36c93-02ea-587f-a087-8233594dcd55/scratchpad/sam/"
img = Image.open("/home/user/Random-Explorations/image-recon-bench/images/lego_r19.png").convert("RGB")
torch.set_num_threads(4)
gen = pipeline("mask-generation", model="facebook/sam2.1-hiera-large", device="cpu")
t = time.time()
res = gen(img, points_per_batch=64, points_per_crop=32, crops_n_layers=2, crop_n_points_downscale_factor=1,
          pred_iou_thresh=0.75, stability_score_thresh=0.85)
masks = np.stack([np.asarray(m, bool) for m in res["masks"]]); scores = np.asarray([float(s) for s in res["scores"]])
print("dense ->", masks.shape, f"{time.time() - t:.0f}s", flush=True)
np.savez_compressed(OUT + "masks_dense.npz", masks=masks, scores=scores)
