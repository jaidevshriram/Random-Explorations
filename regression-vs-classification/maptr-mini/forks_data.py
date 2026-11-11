"""Lane-continuation dataset from real Argoverse 2 lane graphs: where does this lane go next?

Each sample is a start pose on a lane centerline, 2-8 m before the lane segment ends. The answer is the
next 20 m of the route, as 5 points at 4, 8, 12, 16 and 20 m along it. At a fork (a lane segment with
several successors) there are several equally valid routes; the training label picks one at random, the
way a route-following annotation or an autoregressive lane-graph decoder ("language of lanes") sees it.

Input: an ego-centred raster (heading up), 0..24 m ahead x -12..12 m sideways, 64 x 64 px (0.375 m/px):
  ch 0: centerlines of all lanes; ch 1: drivable area; ch 2: the last 10 m of the current lane (where we come from).

    python forks_data.py --logs <dir with av2 logs>      # writes forks.npz
"""
import argparse
import glob
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
HPX, FWD, LAT = 64, 24.0, 12.0
STEPS = np.array([4.0, 8.0, 12.0, 16.0, 20.0])
S_MAX = STEPS[-1]


def arclen(line):
    return np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(line, axis=0), axis=1))])


def cut(line, s0, s1):
    """Sub-polyline between arc lengths s0 and s1."""
    s = arclen(line)
    s1 = min(s1, s[-1])
    keep = (s > s0) & (s < s1)
    a = np.array([np.interp(s0, s, line[:, 0]), np.interp(s0, s, line[:, 1])])
    b = np.array([np.interp(s1, s, line[:, 0]), np.interp(s1, s, line[:, 1])])
    return np.vstack([a, line[keep], b])


def routes(start_line, lane, cl, succ, depth=0):
    """All polylines of length >= S_MAX that start with start_line and continue through successors."""
    L = arclen(start_line)[-1]
    if L >= S_MAX:
        return [cut(start_line, 0, S_MAX)]
    if depth > 6:
        return []
    out = []
    for n in succ.get(lane, []):
        if n in cl:
            out += routes(np.vstack([start_line, cl[n][1:]]), n, cl, succ, depth + 1)
    return out


def resample(line):
    s = arclen(line)
    return np.stack([np.interp(STEPS, s, line[:, 0]), np.interp(STEPS, s, line[:, 1])], -1)


def to_ego(p, origin, yaw):
    c, s = math.cos(yaw), math.sin(yaw)
    d = p - origin
    return np.stack([d[..., 0] * c + d[..., 1] * s, -d[..., 0] * s + d[..., 1] * c], -1)


def px(p):
    """Ego metres (x forward, y left) -> pixel (col, row); heading up, start at bottom centre."""
    return np.stack([(LAT - p[:, 1]) / (2 * LAT) * HPX, (FWD - p[:, 0]) / FWD * HPX], -1)


def raster(cl, drivable, hist, origin, yaw):
    chans = []
    for kind in range(3):
        im = Image.new("L", (HPX, HPX), 0)
        dr = ImageDraw.Draw(im)
        if kind == 0:
            for line in cl.values():
                e = to_ego(line, origin, yaw)
                if (np.abs(e[:, 1]) < LAT + 5).any() and ((e[:, 0] > -5) & (e[:, 0] < FWD + 5)).any():
                    dr.line([tuple(q) for q in px(e)], fill=255, width=1)
        elif kind == 1:
            for poly in drivable:
                e = to_ego(poly, origin, yaw)
                if (np.abs(e[:, 1]) < LAT + 40).any():
                    dr.polygon([tuple(q) for q in px(e)], fill=255)
        else:
            dr.line([tuple(q) for q in px(to_ego(hist, origin, yaw))], fill=255, width=2)
        chans.append(np.asarray(im))
    return np.stack(chans)


def build(log_dirs, per_log=150, seed=0):
    from av2.map.map_api import ArgoverseStaticMap
    import pathlib
    rng = np.random.default_rng(seed)
    imgs, targets, n_modes = [], [], []
    for ld in log_dirs:
        mp = glob.glob(os.path.join(ld, "map", "log_map_archive_*.json"))
        if not mp:
            continue
        avm = ArgoverseStaticMap.from_json(pathlib.Path(mp[0]))
        segs = avm.get_scenario_lane_segments()
        cl = {s.id: avm.get_lane_segment_centerline(s.id)[:, :2] for s in segs}
        succ = {s.id: s.successors for s in segs}
        pred = {}
        for s in segs:
            for n in s.successors:
                pred.setdefault(n, []).append(s.id)
        drivable = [d.xyz[:, :2] for d in avm.get_scenario_vector_drivable_areas()]
        cand = []
        for lid, line in cl.items():
            L = arclen(line)[-1]
            if L < 1.0 or not succ[lid]:
                continue
            s0 = max(0.0, L - rng.uniform(2.0, 8.0))
            rs = routes(cut(line, s0, L), lid, cl, succ)
            if not rs:
                continue
            ends = []
            for r in rs:  # merge routes that end at the same place (lane splits that rejoin)
                p = resample(r)
                if all(np.abs(p - q).max() > 1.5 for q in ends):
                    ends.append(p)
            # where we come from: the 10 m before the start, through a predecessor if needed
            back = cut(line, 0, s0) if s0 > 0 else line[:1]
            if arclen(back)[-1] < 10 and pred.get(lid):
                back = np.vstack([cl[pred[lid][0]], back[1:]])
            back = back[arclen(back) >= arclen(back)[-1] - 10]
            if len(back) < 2:
                back = np.vstack([line[0] - (line[1] - line[0]), line[0]])
            origin = np.array([np.interp(s0, arclen(line), line[:, 0]), np.interp(s0, arclen(line), line[:, 1])])
            d = cut(line, s0, s0 + 1.0) if L - s0 > 1.0 else rs[0][:3]
            yaw = math.atan2(d[-1, 1] - d[0, 1], d[-1, 0] - d[0, 0])
            cand.append((origin, yaw, back, ends))
        rng.shuffle(cand)
        # keep every fork, top up with single-route samples
        forks = [c for c in cand if len(c[3]) > 1]
        singles = [c for c in cand if len(c[3]) == 1]
        chosen = forks[:per_log // 2] + singles[:per_log - min(len(forks), per_log // 2)]
        for origin, yaw, back, ends in chosen:
            imgs.append(raster(cl, drivable, back, origin, yaw))
            t = np.zeros((4, len(STEPS), 2), np.float32)  # at most 4 distinct routes kept
            ends = ends[:4]
            for k, e in enumerate(ends):
                t[k] = to_ego(e, origin, yaw)
            targets.append(t)
            n_modes.append(len(ends))
        print(f"{os.path.basename(ld)[:8]}: {len(forks)} forks, {len(singles)} single", flush=True)
    return np.stack(imgs), np.stack(targets), np.array(n_modes)


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--logs", required=True)
    args = a.parse_args()
    out = {}
    for split in ("train", "val"):
        img, tgt, nm = build(sorted(glob.glob(os.path.join(args.logs, split, "*"))), seed=0 if split == "train" else 1)
        out.update({f"{split}_img": img, f"{split}_tgt": tgt, f"{split}_n": nm})
        print(split, img.shape, "routes per sample:", {k: int((nm == k).sum()) for k in range(1, 5)})
    np.savez_compressed(os.path.join(HERE, "forks.npz"), **out)


if __name__ == "__main__":
    main()
