# Misk Leadership Competency Assessment — RFP

First draft of the RFP for the design, development, validation, and rollout of a
customized leadership competency assessment for the Misk Leadership Track.

## Deliverables

- `Misk_Leadership_Competency_Assessment_RFP_DRAFT_v1.0.docx` — editable draft
- `Misk_Leadership_Competency_Assessment_RFP_DRAFT_v1.0.pdf` — read-only copy for review

The DOCX is built from the "Leadership Programs & Coaching RFP DRAFT – Enh" template,
so styles, cover page, header/footer, numbering, tables and standard clauses are the
Foundation's own. Open the DOCX in Word and accept the prompt to update fields so the
table of contents picks up the current page numbers.

## Source

`source/` holds the scripts used to produce the draft from the template:

- `content.py` — all RFP copy (competency model, uses, scope of work rows, and so on)
- `build_rfp.py` — clones the template and applies the content, preserving formatting
- `topdf.py` — exports the PDF with the table of contents refreshed

Rebuild with `python3 build_rfp.py` from a directory holding `tpl/template.docx`.
