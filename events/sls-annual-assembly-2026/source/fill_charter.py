"""Fill the Misk Event Charter template for the SLS Annual Assembly 2026."""
from copy import deepcopy

from pptx import Presentation
from pptx.oxml.ns import qn

SRC = "charter_template.pptx"
OUT = "SLS_Annual_Assembly_2026_Event_Charter.pptx"
EVENT = "SLS Annual Assembly 2026"


def _strip_err(p):
    for rPr in p.iter(qn("a:rPr")):
        rPr.attrib.pop("err", None)


def _seed_run(p):
    """Give an empty paragraph a run, built from the run properties it ends with."""
    end = p.find(qn("a:endParaRPr"))
    run = p.makeelement(qn("a:r"), {})
    if end is not None:
        rPr = deepcopy(end)
        rPr.tag = qn("a:rPr")
        run.append(rPr)
    t = p.makeelement(qn("a:t"), {})
    t.text = ""
    run.append(t)
    if end is not None:
        end.addprevious(run)
    else:
        p.append(run)


def set_lines(cell, lines, tmpls=(0,)):
    """Rewrite a cell as one paragraph per line.

    Line i is cloned from the cell's existing paragraph tmpls[i], falling back to
    the last entry, so a cell whose first paragraph is bold keeps that emphasis.
    """
    txBody = cell.text_frame._txBody
    paras = txBody.findall(qn("a:p"))
    models = []
    for idx in tmpls:
        model = deepcopy(paras[idx])
        if not model.findall(qn("a:r")):
            _seed_run(model)
        models.append(model)
    for p in paras:
        txBody.remove(p)
    for i, line in enumerate(lines):
        p = deepcopy(models[min(i, len(models) - 1)])
        for br in p.findall(qn("a:br")):
            p.remove(br)
        runs = p.findall(qn("a:r"))
        for extra in runs[1:]:
            p.remove(extra)
        runs[0].find(qn("a:t")).text = line
        _strip_err(p)
        txBody.append(p)


def set_text(cell, text):
    set_lines(cell, [text])


def set_title(shape, text):
    """Replace the first run of a title, dropping the rest of that paragraph's runs."""
    p = shape.text_frame.paragraphs[0]._p
    runs = p.findall(qn("a:r"))
    for extra in runs[1:]:
        p.remove(extra)
    runs[0].find(qn("a:t")).text = text
    _strip_err(p)


def by_id(slide):
    return {sh.shape_id: sh for sh in slide.shapes}


def drop(shape):
    shape._element.getparent().remove(shape._element)


def set_fill(shape, hexcolor):
    shape._element.spPr.find(qn("a:solidFill")).find(qn("a:srgbClr")).set("val", hexcolor)


prs = Presentation(SRC)
s1, s2 = prs.slides[0], prs.slides[1]
b1, b2 = by_id(s1), by_id(s2)

# ------------------------------------------------------------------ slide 1
set_title(b1[19], f"{EVENT} - Event Information (1/2)")

main = b1[5].table
set_text(main.cell(1, 1), EVENT)
set_text(main.cell(1, 3), "[TBC - Leadership Track]")
set_text(main.cell(2, 1), "Leadership")
set_text(main.cell(2, 3), "SLS / Leadership Track")
set_text(main.cell(3, 1), "SLS")
set_text(main.cell(3, 3), "[TBC - EMU]")
set_text(main.cell(4, 1), "Yes")
set_text(main.cell(4, 3), "Hena Experience Center (proposed)")
set_text(main.cell(5, 1), "2030 Leaders graduation")
set_text(main.cell(5, 3), "400 (estimated confirmed)")
set_text(main.cell(6, 1), "Private - invitation only")
set_text(main.cell(6, 3), "400 SLS members")
set_text(main.cell(7, 3), "Yes")

set_lines(b1[12].table.cell(1, 0), [
    "Annual convening of the full SLS membership under the Leadership Track.",
    "The 2026 edition gathers the community at the Hena Experience Center, Riyadh, for one "
    "afternoon-to-evening programme of plenary content, recognition and structured networking. "
    "All members are invited and around 400 are expected to attend.",
], tmpls=(0, 1))

set_lines(b1[2].table.cell(1, 0), [
    "Convene the full SLS membership in one place and reinforce it as a single, active community.",
    "Make networking a designed part of the programme, set out the Track's year and its 2027 agenda, "
    "and beat the 2024 benchmarks: satisfaction of 85% or better (2024: 77%) and 85% of confirmed "
    "guests attending (2024: 320 of 468 registrants).",
], tmpls=(0, 1))

set_lines(b1[3].table.cell(1, 0), [
    "Venue: Hena Experience Center, Riyadh - site survey before contract, exclusive access from 18/11",
    "Agency: full pre-production, on-site delivery, dismantle and closeout",
    "Production: stage, LED, sound, lighting, show-calling, standby generator and UPS on critical AV",
    "Programme: run of show, speaker briefing, capped plenary, Maghrib and Isha prayer breaks",
    "Registration: online sign-up, digital badge (no advance pick-up), 48-hour reconfirmation",
    "Branding: internal and outer signage, wayfinding, photo drop",
    "Guest experience: protocol, seating, valet, traffic and parking, people of determination journey",
    "F&B: catering scaled to reconfirmed numbers, staged release, live cooking and pass-around",
    "Networking activations and side activities running across the venue",
    "Support: translation, photography, videography, cleaning, H&S, medical and security",
    "Post-event: attendee survey and post-event report",
], tmpls=(1,))

budget = b1[14].table
for row in (2, 3, 4):
    set_text(budget.cell(row, 1), "[Cost centre TBC]")
    set_text(budget.cell(row, 2), "SAR TBC")
set_text(budget.cell(2, 3), "SAR TBC")

timeline = b1[16].table
set_text(timeline.cell(1, 1), "06/09/2026")
set_lines(timeline.cell(1, 3), ["21/11/2026", "16:00 - 21:30"])
set_text(timeline.cell(1, 5), "17/12/2026")
set_text(timeline.cell(2, 1), "18/11/2026")
set_text(timeline.cell(2, 4), "23/11/2026")

# ------------------------------------------------------------------ slide 2
set_title(b2[25], f"{EVENT} - Event Information (2/2)")

proj = b2[2].table
set_text(proj.cell(2, 2), "Approved event charter and PO issued")
set_text(proj.cell(2, 3), "06/09/2026")
set_text(proj.cell(2, 4), "01/10/2026")
set_text(proj.cell(3, 2), "Venue contract, agency award and event schedule")
set_text(proj.cell(3, 3), "04/10/2026")
set_text(proj.cell(3, 4), "05/11/2026")
set_lines(proj.cell(4, 2), [
    "Registration open and digital badges issued",
    "Build, load-in and full technical rehearsal",
    "Event day delivery and dismantle",
])
set_lines(proj.cell(4, 3), ["08/11/2026", "18/11/2026", "21/11/2026"])
set_lines(proj.cell(4, 4), ["19/11/2026", "20/11/2026", "23/11/2026"])
set_text(proj.cell(5, 2), "Post-event report, survey results and vendor closeout")
set_text(proj.cell(5, 3), "24/11/2026")
set_text(proj.cell(5, 4), "17/12/2026")

stake = b2[27].table
set_lines(stake.cell(3, 0), [
    "Leadership Track",
    "Events (EMU)",
    "Procurement/Legal",
])
set_lines(stake.cell(3, 1), [
    "[TBC] - Sponsor",
    "[TBC] - Manager",
    "[TBC] - Contracts",
])
set_lines(stake.cell(3, 2), [
    "Hena Experience Center",
    "Event agency (RFP)",
])
set_lines(stake.cell(3, 3), [
    "[TBC] - Venue ops",
    "[TBC] - Delivery",
])

risks = b2[3].table
set_text(risks.cell(2, 1), "Attendance gap: 320 of 468 attended in 2024.")
set_text(risks.cell(2, 3), "Catering and seating built to a 48-hour reconfirmed headcount.")
set_text(risks.cell(2, 4), "Track / EMU")
set_text(risks.cell(3, 1), "New venue load-in window and power continuity.")
set_text(risks.cell(3, 3), "Site survey, three-day exclusive build access, standby generator in RFP.")
set_text(risks.cell(3, 4), "EMU / Production")

# Severity: both entries are risks, so replace the second row's issue icon with a
# risk icon, and set the dots to High / Medium.
set_fill(b2[4], "C00000")   # row 1 severity - High
set_fill(b2[5], "FFB500")   # row 2 severity - Medium

risk_icon = deepcopy(b2[6]._element)
src_y = int(b2[6]._element.spPr.find(qn("a:xfrm")).find(qn("a:off")).get("y"))
delta = int(b2[5]._element.spPr.find(qn("a:xfrm")).find(qn("a:off")).get("y")) - \
         int(b2[4]._element.spPr.find(qn("a:xfrm")).find(qn("a:off")).get("y"))
risk_icon.spPr.find(qn("a:xfrm")).find(qn("a:off")).set("y", str(src_y + delta))
risk_icon.nvSpPr.cNvPr.set("id", "300")
risk_icon.nvSpPr.cNvPr.set("name", "Risk icon row 2")
drop(b2[7])                                     # the "!" issue icon
b2[6]._element.getparent().append(risk_icon)

# Level of attendees: keep Key CEOs, Partners, Beneficiaries.
drop(b2[30])    # Royal Highness, Highnesses and Excellencies
drop(b2[33])    # Public
# CEO / DCEO required: CEO only.
drop(b2[10])    # DCEO

prs.save(OUT)
print("wrote", OUT)
