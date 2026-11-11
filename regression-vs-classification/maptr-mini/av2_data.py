"""Argoverse 2 map patches with MapTRv2's target construction, for CPU experiments.

Replicates (hustvl/MapTR, branch maptrv2, commit e03f097):
  tools/maptrv2/custom_av2_map_converter.py  extract_local_map: dividers (lane-graph paths of non-intersection
      lane boundaries, clipped to the rotated patch, near-duplicates with buffer IoU >= 0.9 removed), boundaries
      (union of drivable areas, exteriors clockwise / interiors counter-clockwise, clipped to the patch shrunk by
      0.2 m, line-merged), pedestrian crossings (parallel crossings unioned, exteriors counter-clockwise, clipped,
      line-merged)
  datasets/av2_map_dataset.py  fixed 20 points per instance sampled evenly by arc length; targets with
      gt_shift_pts_pattern='v2' (polygons: roll the start to every original vertex, at most 19 picked at random;
      lines: forward and flipped); points clamped to the patch; normalised by pc_range
  config maptrv2_av2_3d_r50_6ep.py  pc_range x in [-30, 30] m (forward), y in [-15, 15] m; classes divider,
      ped_crossing, boundary

Input: a 3-channel top-down raster of the same map elements (no cameras), 0.3 m/px, optionally degraded.

    python av2_data.py --logs <dir with av2 logs>      # builds av2_patches.npz and prints statistics
"""
import argparse
import glob
import json
import math
import os

import networkx as nx
import numpy as np
import pandas as pd
from PIL import Image, ImageDraw
from shapely import affinity, ops
from shapely.geometry import LineString, MultiLineString, MultiPolygon, Polygon, box
from shapely.geometry import CAP_STYLE, JOIN_STYLE
from shapely.strtree import STRtree

HERE = os.path.dirname(os.path.abspath(__file__))
X_RANGE, Y_RANGE = 60.0, 30.0  # metres: x forward in [-30, 30], y left in [-15, 15]
P = 20
CLASSES = ["divider", "ped_crossing", "boundary"]
RES = 0.3  # m/px of the input raster (MapTR's BEV grid is 200 x 100 over 60 x 30 m)


def patch_coord(cx, cy, angle_deg):
    """nuScenes NuScenesMapExplorer.get_patch_coord with patch_box = (x, y, patch_h=30, patch_w=60)."""
    p = box(cx - X_RANGE / 2, cy - Y_RANGE / 2, cx + X_RANGE / 2, cy + Y_RANGE / 2)
    return affinity.rotate(p, angle_deg, origin=(cx, cy), use_radians=False)


def to_ego(coords, R, t):
    xyz = np.asarray(coords, dtype=float)
    if xyz.shape[1] == 2:
        xyz = np.concatenate([xyz, np.zeros((len(xyz), 1))], 1)
    return ((xyz - t) @ R)[:, :2]


# ---------------------------------------------------------------- converter (custom_av2_map_converter.py)

def lane_paths(lane_dict):
    G = nx.DiGraph()
    for key, v in lane_dict.items():
        pts = np.asarray(v["line"]).round(3)
        for a, b in zip(pts[:-1], pts[1:]):
            G.add_edge(tuple(a), tuple(b))
        for pred in v["pred"]:
            if pred in lane_dict:
                G.add_edge(tuple(np.asarray(lane_dict[pred]["line"]).round(3)[-1]), tuple(pts[0]))
        for succ in v["succ"]:
            if succ in lane_dict:
                G.add_edge(tuple(pts[-1]), tuple(np.asarray(lane_dict[succ]["line"]).round(3)[0]))
    roots = [n for n, d in G.in_degree() if d == 0]
    leaves = [n for n, d in G.out_degree() if d == 0]
    paths = []
    for r in roots:
        for path in nx.all_simple_paths(G, r, leaves):
            paths.append(LineString(path).simplify(0.2, preserve_topology=True))
    return paths


def nearby_dividers(avm, patch):
    near = {}
    for ls in avm.get_scenario_lane_segments():
        poly = Polygon(ls.polygon_boundary[:, :2])
        if poly.is_valid and not poly.intersection(patch).is_empty and not ls.is_intersection:
            near[ls.id] = ls
    left, right = {}, {}
    for k, ls in near.items():
        if ls.left_neighbor_id is not None:
            left[k] = dict(line=ls.left_lane_boundary.xyz[:, :2], pred=ls.predecessors, succ=ls.successors,
                           nb=ls.left_neighbor_id)
        if ls.right_neighbor_id is not None:
            right[k] = dict(line=ls.right_lane_boundary.xyz[:, :2], pred=ls.predecessors, succ=ls.successors,
                            nb=ls.right_neighbor_id)
    for k, v in list(left.items()):
        if v["nb"] in right:
            del right[v["nb"]]
    for k, v in list(right.items()):
        if v["nb"] in left:
            del left[v["nb"]]
    return lane_paths(left) + lane_paths(right)


def local_dividers(dividers, patch, R, t):
    lines = []
    for line in dividers:
        if line.is_empty:
            continue
        new = line.intersection(patch)
        if new.is_empty:
            continue
        geoms = new.geoms if new.geom_type == "MultiLineString" else [new]
        for g in geoms:
            if not g.is_empty and g.geom_type == "LineString":
                lines.append(LineString(to_ego(g.coords, R, t)))
    if not lines:
        return []
    polys = [l.buffer(1, cap_style=CAP_STYLE.flat, join_style=JOIN_STYLE.mitre) for l in lines]
    tree = STRtree(polys)
    keep, remain = [], list(range(len(lines)))
    for i, pl in enumerate(polys):
        if i not in remain:
            continue
        remain.remove(i)
        keep.append(lines[i])
        for o in tree.query(pl):
            o = int(o)
            if o not in remain:
                continue
            union = polys[o].union(pl).area
            if union > 0 and polys[o].intersection(pl).area / union >= 0.90:
                remain.remove(o)
    return [np.asarray(l.coords) for l in keep]


def polygons_in_patch(polys_city, patch, R, t):
    out = []
    for coords in polys_city:
        poly = Polygon(coords)
        if not poly.is_valid:
            continue
        new = poly.intersection(patch)
        if new.is_empty:
            continue
        parts = new.geoms if new.geom_type == "MultiPolygon" else [new] if new.geom_type == "Polygon" else []
        ego = []
        for p in parts:
            if p.is_valid and not p.is_empty:
                q = Polygon(to_ego(p.exterior.coords, R, t), [to_ego(i.coords, R, t) for i in p.interiors])
                if q.is_valid:
                    ego.append(q)
        if ego:
            out.append(MultiPolygon(ego))
    return out


def lines_from(geom):
    if geom.is_empty:
        return []
    if geom.geom_type == "MultiLineString":
        geom = ops.linemerge(geom)
    if geom.geom_type == "LineString":
        return [np.asarray(geom.coords)]
    if geom.geom_type == "MultiLineString":
        return [np.asarray(g.coords) for g in geom.geoms]
    return [np.asarray(g.coords) for g in getattr(geom, "geoms", []) if g.geom_type == "LineString"]


def local_boundaries(avm, patch, R, t):
    polys = polygons_in_patch([da.xyz[:, :2] for da in avm.get_scenario_vector_drivable_areas()], patch, R, t)
    if not polys:
        return []
    union = ops.unary_union(polys)
    if union.geom_type != "MultiPolygon":
        union = MultiPolygon([union])
    local = box(-X_RANGE / 2 + 0.2, -Y_RANGE / 2 + 0.2, X_RANGE / 2 - 0.2, Y_RANGE / 2 - 0.2)
    res = []
    for poly in union.geoms:
        ext = poly.exterior
        if ext.is_ccw:
            ext = LineString(list(ext.coords)[::-1])
        res += lines_from(LineString(ext.coords).intersection(local))
        for inter in poly.interiors:
            if not inter.is_ccw:
                inter = LineString(list(inter.coords)[::-1])
            res += lines_from(LineString(inter.coords).intersection(local))
    return res


def local_peds(avm, patch, R, t):
    polys = polygons_in_patch([pc.polygon[:, :2] for pc in avm.get_scenario_ped_crossings()], patch, R, t)
    if not polys:
        return []

    def direction(g):
        r = np.asarray(g.minimum_rotated_rectangle.exterior.coords)[:3]
        v = r[1:] - r[:-1]
        n = np.linalg.norm(v, axis=-1)
        return v[n.argmax()], n.max()

    tree = STRtree(polys)
    final, remain = [], list(range(len(polys)))
    for i, g in enumerate(polys):
        if i not in remain:
            continue
        remain.remove(i)
        gv, gn = direction(g)
        final.append(g)
        for o in tree.query(g):
            o = int(o)
            if o not in remain:
                continue
            ov, on = direction(polys[o])
            if 1 - abs(gv.dot(ov) / (gn * on + 1e-9)) < 0.01:
                final[-1] = final[-1].union(polys[o])
                remain.remove(o)
    local = box(-X_RANGE / 2 + 0.2, -Y_RANGE / 2 + 0.2, X_RANGE / 2 - 0.2, Y_RANGE / 2 - 0.2)
    res = []
    for g in final:
        for p in (g.geoms if g.geom_type == "MultiPolygon" else [g]):
            ext = p.exterior
            if not ext.is_ccw:
                ext = LineString(list(ext.coords)[::-1])
            lines = LineString(ext.coords).intersection(local)
            if lines.is_empty:
                continue
            if lines.geom_type != "LineString":
                lines = ops.linemerge(lines)
            if lines.geom_type != "LineString":
                lines = LineString(np.concatenate([np.asarray(l.coords) for l in lines.geoms], 0))
            res.append(np.asarray(lines.coords))
    return res

# ---------------------------------------------------------------- MapTR target sampling (av2_map_dataset.py)


def sample_fixed(coords, n=P):
    line = LineString(coords)
    return np.array([line.interpolate(d).coords[0] for d in np.linspace(0, line.length, n)])


def shifts_v2(coords, n=P):
    """shift_fixed_num_sampled_points_v2: all start-vertex rolls for closed polylines (no flip), forward +
    flipped for open ones. Returns (num_shifts, n, 2); the random <= 19 subset is drawn at training time."""
    pts = np.asarray(coords)
    if np.allclose(pts[0], pts[-1]):
        ring = pts[:-1]
        out = [sample_fixed(np.vstack([np.roll(ring, k, 0), np.roll(ring, k, 0)[:1]]), n) for k in range(len(ring))]
    else:
        s = sample_fixed(pts, n)
        out = [s, s[::-1]]
    out = np.stack(out)
    out[..., 0] = out[..., 0].clip(-X_RANGE / 2, X_RANGE / 2)
    out[..., 1] = out[..., 1].clip(-Y_RANGE / 2, Y_RANGE / 2)
    return out


def normalize(pts):
    """Metres (ego frame) -> [0, 1], MapTR's normalize_2d_pts with pc_range [-30, -15, ..., 30, 15, ...]."""
    out = np.empty_like(pts)
    out[..., 0] = (pts[..., 0] + X_RANGE / 2) / X_RANGE
    out[..., 1] = (pts[..., 1] + Y_RANGE / 2) / Y_RANGE
    return out


def rasterize(instances, res=RES, width_m=0.45):
    """3-channel top-down image (channel = class). Columns = x forward, rows = y (row 0 at y = -15 m)."""
    W, H, ss = int(X_RANGE / res), int(Y_RANGE / res), 3
    chans = []
    for c in range(len(CLASSES)):
        img = Image.new("L", (W * ss, H * ss), 0)
        d = ImageDraw.Draw(img)
        for cls, coords in instances:
            if cls == c:
                n = normalize(np.asarray(coords))
                d.line([(u * W * ss, v * H * ss) for u, v in n], fill=255, width=max(1, int(width_m / res * ss)))
        chans.append(np.asarray(img.resize((W, H), Image.BOX), dtype=np.uint8))
    return np.stack(chans)


def build(log_dirs, spacing_m=4.0, max_per_log=60):
    from av2.map.map_api import ArgoverseStaticMap
    samples = []
    for log in log_dirs:
        mp = glob.glob(os.path.join(log, "map", "log_map_archive_*.json"))
        if not mp:
            continue
        avm = ArgoverseStaticMap.from_json(__import__("pathlib").Path(mp[0]))
        poses = pd.read_feather(os.path.join(log, "city_SE3_egovehicle.feather"))
        last, n = None, 0
        for _, r in poses.iterrows():
            tr = np.array([r.tx_m, r.ty_m, r.tz_m])
            if last is not None and np.linalg.norm(tr[:2] - last[:2]) < spacing_m:
                continue
            last = tr
            qw, qx, qy, qz = r.qw, r.qx, r.qy, r.qz
            R = np.array([[1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw)],
                          [2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw)],
                          [2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)]])
            yaw = math.degrees(math.atan2(R[1, 0], R[0, 0]))
            patch = patch_coord(tr[0], tr[1], yaw)
            inst = [(0, c) for c in local_dividers(nearby_dividers(avm, patch), patch, R, tr)]
            inst += [(1, c) for c in local_peds(avm, patch, R, tr)]
            inst += [(2, c) for c in local_boundaries(avm, patch, R, tr)]
            inst = [(c, x) for c, x in inst if len(x) >= 2 and LineString(x).length > 0.5]
            if not inst:
                continue
            samples.append(dict(log=os.path.basename(log), instances=inst))
            n += 1
            if n >= max_per_log:
                break
    return samples


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--logs", required=True)
    ap.add_argument("--out", default=os.path.join(HERE, "av2_patches.npz"))
    args = ap.parse_args()
    out = {}
    for split in ("train", "val"):
        logs = sorted(glob.glob(os.path.join(args.logs, split, "*")))
        s = build(logs)
        out[split] = s
        print(split, len(logs), "logs ->", len(s), "patches")
    def pack(samples):
        imgs = np.stack([rasterize(s["instances"]) for s in samples])
        labels = np.array([np.array([c for c, _ in s["instances"]]) for s in samples] + [None], dtype=object)[:-1]
        orders = np.array([[normalize(shifts_v2(x)).astype(np.float32) for _, x in s["instances"]] for s in samples] + [None],
                          dtype=object)[:-1]
        raw = np.array([[np.asarray(x, dtype=np.float32) for _, x in s["instances"]] for s in samples] + [None], dtype=object)[:-1]
        return imgs, labels, orders, raw
    tr, va = pack(out["train"]), pack(out["val"])
    np.savez_compressed(args.out, tr_img=tr[0], tr_lab=tr[1], tr_orders=tr[2], tr_raw=tr[3],
                        va_img=va[0], va_lab=va[1], va_orders=va[2], va_raw=va[3])
    stats = {}
    for name, (imgs, labels, orders, raw) in (("train", tr), ("val", va)):
        n_inst = [len(l) for l in labels]
        cls = np.concatenate(list(labels))
        closed = [o.shape[0] for os_ in orders for o in os_ if o.shape[0] > 2]
        stats[name] = dict(patches=len(imgs), instances_per_patch_mean=float(np.mean(n_inst)),
                           instances_per_patch_max=int(np.max(n_inst)),
                           class_counts={c: int((cls == i).sum()) for i, c in enumerate(CLASSES)},
                           closed_polylines=len(closed),
                           closed_with_more_than_19_vertices=int(sum(k > 19 for k in closed)))
    print(json.dumps(stats, indent=1))


if __name__ == "__main__":
    main()
