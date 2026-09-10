# Misk Leadership Competency Model & Assessment — RFP

The RFP for reviewing and developing the Misk leadership competency model across the
Leadership Track, building a customized assessment against it, delivering that assessment
as a working tool, and training the Foundation's team to use it.

## Deliverable

- `Misk_Leadership_Competency_Model_and_Assessment_RFP_v1.0.docx` — editable draft
- `Misk_Leadership_Competency_Model_and_Assessment_RFP_v1.0.pdf` — read-only copy for review

The RFP presents the Foundation's seven Leadership Track competencies as the starting
point, not as a fixed constraint: Scope 1 asks the awarded Vendor to confirm the
competency set or recommend revisions on the evidence, and proposals must allow for
competencies being added, merged, renamed, or redefined without re-pricing.

Built on the **Professional Services RFP Template (Misk Foundation v4)**, so the cover,
header/footer, table of contents, styles, numbering, tables, and standard clauses are the
Foundation's own. Open the DOCX in Word and accept the prompt to update fields so the
table of contents picks up the current page numbers.

## Still to fill in before release

- Beneficiary volumes (programs section and the volumes table) need confirming
- The seven competency descriptions are indicative and need the official definitions
- RFP dates, and the annexure pack referenced in Appendix 2

## Source

`source/` holds the scripts used to produce the draft from the template:

- `content.py` — the RFP copy
- `variants.py` — build configuration
- `build_rfp2.py` — clones the template and applies the content, preserving formatting
- `topdf.py` — exports the PDF with the table of contents refreshed

Rebuild with `python3 build_rfp2.py A` from a directory holding `tpl2/template.docx`.

An alternative draft that omitted the existing competencies entirely — asking bidders to
derive the model from their own analysis of the Track — was retired in favour of this one.
It is recoverable from commit `46af55b`, or by running `python3 build_rfp2.py B`.
