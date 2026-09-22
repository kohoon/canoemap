"""Select nearby weirs with a conservative latitude prefilter and exact distance."""
import math as _math
from bisect import bisect_left, bisect_right
def _hav_km(a, b):
    R = 6371.0
    la1, lo1, la2, lo2 = map(_math.radians, [a[0], a[1], b[0], b[1]])
    h = _math.sin((la2-la1)/2)**2 + _math.cos(la1)*_math.cos(la2)*_math.sin((lo2-lo1)/2)**2
    return 2*R*_math.asin(_math.sqrt(h))


def select_weirs(all_weirs, points):
    ordered = sorted(points)
    latitudes = [p[0] for p in ordered]
    selected = []
    for weir in all_weirs:
        radius = 8.0 if weir.get("g") == "국가" else 1.5
        # Great-circle distance is at least the latitude difference times R.
        # The epsilon keeps boundary points for the original exact check.
        latitude_span = _math.degrees(radius / 6371.0) + 1e-10
        lo = bisect_left(latitudes, weir["lat"] - latitude_span)
        hi = bisect_right(latitudes, weir["lat"] + latitude_span)
        if any(_hav_km((weir["lat"], weir["lng"]), point) <= radius
               for point in ordered[lo:hi]):
            selected.append({k: weir[k] for k in ("nm", "river", "lat", "lng")})
    return selected
