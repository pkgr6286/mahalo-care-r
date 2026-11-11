"""Create PDF-safe static TTF bytes from the application's official Noto Sans WOFF2.

PDFKit/fontkit's WOFF2 subsetter can fail on composite glyphs. The browser keeps
using the original WOFF2; this lossless static instance is only for generated PDFs.
Run with: uv run python tools/build-pdf-font.py
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

root = Path(__file__).resolve().parents[1] / "artifacts/mahalo-care/public/brand/fonts"
font = TTFont(root / "noto-sans-mahalo-latin.woff2", recalcTimestamp=False)
if "fvar" in font:
    axes = {axis.axisTag: axis.defaultValue for axis in font["fvar"].axes}
    if "wght" in axes:
        axes["wght"] = 400
    font = instantiateVariableFont(font, axes, inplace=True)
font.flavor = None
font.recalcTimestamp = False
font.save(root / "noto-sans-mahalo-pdf-400.ttf")
