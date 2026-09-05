#!/usr/bin/env python3
"""Read-only companion to update_platform.py (same classifier, no divergent logic)."""
from update_platform import main

if __name__ == "__main__":
    raise SystemExit(main(read_only=True))
