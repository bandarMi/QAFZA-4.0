# Misk Leadership Competency Model & Assessment — RFP

First draft of the RFP for reviewing and developing the Misk leadership competency
model across the Leadership Track, and for building, validating, and rolling out a
customized assessment against it.

## Deliverables

- `Misk_Leadership_Competency_Model_and_Assessment_RFP_DRAFT_v2.0.docx` — editable draft
- `Misk_Leadership_Competency_Model_and_Assessment_RFP_DRAFT_v2.0.pdf` — read-only copy for review

Built on the current **Professional Services RFP Template (Misk Foundation v4)**, so the
cover, header/footer, table of contents, styles, numbering, tables, and standard clauses
are the Foundation's own. Open the DOCX in Word and accept the prompt to update fields so
the table of contents picks up the current page numbers.

An earlier draft (`v1.0`) was built on the superseded "Leadership Programs & Coaching RFP
DRAFT – Enh" template and has been removed.

## Source

`source/` holds the scripts used to produce the draft from the template:

- `content.py` — all RFP copy (competency model, uses, scope of work rows, phases, and so on)
- `build_rfp2.py` — clones the template and applies the content, preserving formatting
- `build_rfp.py` — the earlier build against the superseded template, kept for reference
- `topdf.py` — exports the PDF with the table of contents refreshed

Rebuild with `python3 build_rfp2.py` from a directory holding `tpl2/template.docx`.
