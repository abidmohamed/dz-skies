"""dz-skies data pipeline: fetch public sources, build the site's data, validate it."""
import sys

for _stream in (sys.stdout, sys.stderr):     # airport names contain accents; never crash on a console that cannot print them
    try:
        _stream.reconfigure(errors="replace")
    except Exception:
        pass
