# M4.2 POC：選角畫面對手圖示辨識（純模板比對、零 AI）
# 模板：PokeAPI HOME 渲染圖（1531 張）；輸入：6 張卡片裁切
import cv2, numpy as np, json, glob, os, time

BASE = os.path.dirname(os.path.abspath(__file__))
dexmap = json.load(open(f'{BASE}/dexmap.json'))
SCALES = [64, 80, 96]  # 模板縮放後高度（sprite 在裁切中約 80-110px）

def load_template(path):
    t = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if t is None or t.shape[2] < 4:
        return None
    a = t[:, :, 3]
    ys, xs = np.where(a > 10)
    if len(xs) < 50:
        return None
    t = t[ys.min():ys.max()+1, xs.min():xs.max()+1]
    return t

def variants(t):
    out = []
    h, w = t.shape[:2]
    for th in SCALES:
        tw = max(8, int(w * th / h))
        if tw > 200:  # 太寬的（如一家鼠橫排）以寬度為準
            tw, th2 = 200, max(8, int(h * 200 / w))
        else:
            th2 = th
        r = cv2.resize(t, (tw, th2), interpolation=cv2.INTER_AREA)
        bgr = r[:, :, :3]
        mask = (r[:, :, 3] > 10).astype(np.uint8) * 255
        mask3 = cv2.merge([mask, mask, mask])
        out.append((bgr, mask3))
    return out

def score(crop, tvars):
    best = -1.0
    for bgr, mask in tvars:
        th, tw = bgr.shape[:2]
        if th >= crop.shape[0] or tw >= crop.shape[1]:
            continue
        res = cv2.matchTemplate(crop, bgr, cv2.TM_CCORR_NORMED, mask=mask)
        res = np.nan_to_num(res, nan=-1, posinf=-1, neginf=-1)
        m = float(res.max())
        if m > best:
            best = m
    return best

t0 = time.time()
crops = [cv2.imread(f'{BASE}/crop_{i}.png') for i in range(6)]
paths = sorted(glob.glob(f'{BASE}/pokeapi-sprites/sprites/pokemon/other/home/*.png'))
# 只取「純數字.png」（標準型態；含 - 的是型態變化，POC 先跳過以省時間，但保留 Mega 常見的不需要——選角是原型態）
paths = [p for p in paths if os.path.basename(p).split('.')[0].isdigit()]
print(f'templates: {len(paths)}')

results = [[] for _ in range(6)]
for p in paths:
    num = os.path.basename(p).split('.')[0]
    name = dexmap.get(num)
    if not name:
        continue
    t = load_template(p)
    if t is None:
        continue
    tv = variants(t)
    for i, c in enumerate(crops):
        s = score(c, tv)
        results[i].append((s, name, num))

for i, r in enumerate(results):
    r.sort(reverse=True)
    top = ' | '.join(f'{n}({num}) {s:.3f}' for s, n, num in r[:3])
    print(f'crop_{i}: {top}')
print(f'elapsed: {time.time()-t0:.1f}s')
