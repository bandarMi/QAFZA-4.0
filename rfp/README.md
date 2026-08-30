# Misk Leadership Competency Model & Assessment — RFP

Two options for the same procurement: developing the Misk leadership competency model
for the Leadership Track, building a customized assessment against it, delivering that
assessment as a working tool, and training the Foundation's team to use it.

## Deliverables

**Option A — refine the existing model**
- `Misk_Leadership_Competency_RFP_Option_A_Existing_Model_v1.0.docx` / `.pdf`

Puts the Foundation's seven Leadership Track competencies in front of Bidders and asks
them to review, revise, and calibrate the model across every leadership level, then build
the assessment against it. The model is presented as the Track's own — no program is
named as its source.

**Option B — develop a new model**
- `Misk_Leadership_Competency_RFP_Option_B_New_Model_v1.0.docx` / `.pdf`

Says nothing about an existing model. Bidders analyse the Leadership Track, the
Foundation's ambitions, and the Saudi leadership context, and propose the competencies
themselves — their number, structure, naming, and definitions — with the evidence behind
them, then build the assessment against what the Foundation approves.

Everything else is identical between the two: the programs covered, the uses of the
assessment, the case for a customized instrument, the tool, the training, the volumes,
and all standard clauses.

Both are built on the **Professional Services RFP Template (Misk Foundation v4)**, so the
cover, header/footer, table of contents, styles, numbering, tables, and standard clauses
are the Foundation's own. Open a DOCX in Word and accept the prompt to update fields so
the table of contents picks up the current page numbers.

## Source

`source/` holds the scripts used to produce the drafts from the template:

- `content.py` — shared RFP copy
- `variants.py` — what differs between Option A and Option B
- `build_rfp2.py` — clones the template and applies the content, preserving formatting
- `topdf.py` — exports the PDF with the table of contents refreshed

Rebuild with `python3 build_rfp2.py A` and `python3 build_rfp2.py B` from a directory
holding `tpl2/template.docx`.
