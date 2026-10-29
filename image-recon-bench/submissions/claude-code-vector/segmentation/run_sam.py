import sys, time, numpy as np, torch
from PIL import Image
from transformers import pipeline
OUT = "/tmp/claude-0/-home-user-Random-Explorations/e6f36c93-02ea-587f-a087-8233594dcd55/scratchpad/sam/"
img = Image.open("/home/user/Random-Explorations/image-recon-bench/images/lego_r19.png").convert("RGB")
torch.set_num_threads(4)
for model in (sys.argv[1:] or ["facebook/sam2.1-hiera-large", "facebook/sam-vit-large"]):
    try:
        t = time.time()
        gen = pipeline("mask-generation", model=model, device="cpu")
        print("loaded", model, f"{time.time() - t:.0f}s", flush=True)
        t = time.time()
        res = gen(img, points_per_batch=64, pred_iou_thresh=0.80, stability_score_thresh=0.88, crops_n_layers=1, crop_n_points_downscale_factor=1)
        masks = np.stack([np.asarray(m, bool) for m in res["masks"]])
        scores = np.asarray([float(s) for s in res["scores"]])
        print(model, "->", masks.shape, f"{time.time() - t:.0f}s", flush=True)
        np.savez_compressed(OUT + "masks_" + model.split("/")[-1] + ".npz", masks=masks, scores=scores)
        break
    except Exception as e:
        print("FAILED", model, type(e).__name__, str(e)[:300], flush=True)
