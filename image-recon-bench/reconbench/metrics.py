"""PSNR and SSIM in plain numpy.

SSIM follows Wang et al. 2004: 11x11 Gaussian window (sigma 1.5), K1=0.01,
K2=0.03, computed per RGB channel and averaged. This matches
skimage.metrics.structural_similarity(gaussian_weights=True, sigma=1.5,
use_sample_covariance=False, data_range=255, channel_axis=-1) to within
floating-point noise, without pulling in scipy/skimage.
"""

import math

import numpy as np

DATA_RANGE = 255.0


def psnr(ref: np.ndarray, test: np.ndarray) -> float:
    """PSNR in dB over all pixels and channels. Identical images -> inf."""
    mse = np.mean((ref.astype(np.float64) - test.astype(np.float64)) ** 2)
    if mse == 0:
        return math.inf
    return 10.0 * math.log10(DATA_RANGE**2 / mse)


def _gaussian_kernel(sigma: float = 1.5, radius: int = 5) -> np.ndarray:
    x = np.arange(-radius, radius + 1, dtype=np.float64)
    k = np.exp(-(x**2) / (2 * sigma**2))
    return k / k.sum()


def _filter(img: np.ndarray, k: np.ndarray) -> np.ndarray:
    """Separable 'valid' convolution of an (H, W) array with 1D kernel k."""
    n = len(k)
    h, w = img.shape
    rows = sum(k[i] * img[:, i : w - n + 1 + i] for i in range(n))
    return sum(k[i] * rows[i : h - n + 1 + i, :] for i in range(n))


def _ssim_channel(x: np.ndarray, y: np.ndarray, k: np.ndarray) -> float:
    c1 = (0.01 * DATA_RANGE) ** 2
    c2 = (0.03 * DATA_RANGE) ** 2
    mu_x, mu_y = _filter(x, k), _filter(y, k)
    sxx = _filter(x * x, k) - mu_x**2
    syy = _filter(y * y, k) - mu_y**2
    sxy = _filter(x * y, k) - mu_x * mu_y
    num = (2 * mu_x * mu_y + c1) * (2 * sxy + c2)
    den = (mu_x**2 + mu_y**2 + c1) * (sxx + syy + c2)
    return float(np.mean(num / den))


def ssim(ref: np.ndarray, test: np.ndarray) -> float:
    """Mean SSIM over RGB channels, in [-1, 1] (1 = identical)."""
    k = _gaussian_kernel()
    ref = ref.astype(np.float64)
    test = test.astype(np.float64)
    return float(np.mean([_ssim_channel(ref[..., c], test[..., c], k) for c in range(ref.shape[-1])]))


def error_heatmap(ref: np.ndarray, test: np.ndarray, gain: float = 4.0) -> np.ndarray:
    """Grayscale |ref - test| averaged over channels and amplified; bright = wrong."""
    err = np.abs(ref.astype(np.int16) - test.astype(np.int16)).mean(axis=2)
    return np.clip(err * gain, 0, 255).astype(np.uint8)
