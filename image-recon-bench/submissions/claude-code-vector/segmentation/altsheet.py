# contact sheet: for each prompt, the crop around it with each of SAM's three alternatives outlined
import sys, json, numpy as np, cv2
D = "/tmp/claude-0/-home-user-Random-Explorations/e6f36c93-02ea-587f-a087-8233594dcd55/scratchpad/sam/"
z = np.load(D + sys.argv[1]); prompts = json.load(open(D + sys.argv[2]))
img = cv2.imread("/home/user/Random-Explorations/image-recon-bench/images/lego_r19.png")
rows = []
for n, (p, alts) in enumerate(zip(prompts, z["alts"])):
    pts = p.get("pos", []) + ([[p["box"][0], p["box"][1]], [p["box"][2], p["box"][3]]] if p.get("box") else [])
    cx, cy = np.mean(pts, 0).astype(int)
    tiles = []
    for k in range(3):
        m = alts[k]
        ys, xs = np.nonzero(m)
        if len(ys) and m.sum() < 60000:
            x0, x1 = max(min(xs.min(), cx) - 15, 0), min(max(xs.max(), cx) + 15, 800)
            y0, y1 = max(min(ys.min(), cy) - 15, 0), min(max(ys.max(), cy) + 15, 800)
        else:
            x0, x1, y0, y1 = max(cx - 60, 0), min(cx + 60, 800), max(cy - 60, 0), min(cy + 60, 800)
        v = img.copy()
        cs, _ = cv2.findContours(m.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        v[m] = (0.55 * v[m] + 0.45 * np.array([255, 0, 255])).astype(np.uint8)
        cv2.drawContours(v, cs, -1, (255, 0, 255), 1)
        for q in p.get("pos", []): cv2.circle(v, tuple(map(int, q)), 2, (0, 200, 0), -1)
        for q in p.get("neg", []): cv2.circle(v, tuple(map(int, q)), 2, (0, 0, 255), -1)
        t = v[y0:y1, x0:x1]
        sc = 160 / max(t.shape[:2]); t = cv2.resize(t, None, fx=sc, fy=sc, interpolation=cv2.INTER_NEAREST)
        t = cv2.copyMakeBorder(t, 0, 170 - t.shape[0], 0, 170 - t.shape[1], cv2.BORDER_CONSTANT, value=(255, 255, 255))
        cv2.putText(t, f"{n}.{k} a{int(m.sum())}", (2, 166), cv2.FONT_HERSHEY_PLAIN, 0.8, (0, 0, 0), 1)
        tiles.append(t)
    label = np.full((170, 150, 3), 255, np.uint8)
    for i, w in enumerate(p["name"].split("/")[-1].split(" ")[:6]):
        cv2.putText(label, w, (4, 20 + 18 * i), cv2.FONT_HERSHEY_PLAIN, 0.9, (0, 0, 0), 1)
    rows.append(np.hstack([label] + tiles))
sheet = np.vstack(rows)
half = (len(rows) + 1) // 2
cv2.imwrite(D + "alts_a.png", np.vstack(rows[:half])); cv2.imwrite(D + "alts_b.png", np.vstack(rows[half:]))
