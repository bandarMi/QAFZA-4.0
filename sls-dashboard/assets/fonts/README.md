# Fonts

## `arabic.ttf` — optional, enables Arabic PDF export

Drop an Arabic TrueType font here, named exactly `arabic.ttf`, and the PDF report generator will embed it.

Without it, requesting an Arabic PDF produces an **English** PDF with a note on the cover page saying so —
rather than a page of empty boxes. The in-app Arabic interface does not need this file; it renders natively
in the browser.

Suitable open-licence options: **Noto Naskh Arabic**, **IBM Plex Sans Arabic**, **Cairo** (all SIL OFL).

Note that PDFKit embeds glyphs but does not perform bidi reordering or contextual shaping, so complex Arabic
typography in the PDF will be imperfect even with a font present. Report headings and labels will render;
long Arabic prose is better served by the in-app view or by printing from the browser.
