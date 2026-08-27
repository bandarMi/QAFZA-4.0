# -*- coding: utf-8 -*-
"""Build the Misk Leadership Competency Assessment RFP from the Misk RFP template.

The template's styles, header, footer, cover, numbering, tables and boilerplate are
preserved; only project-specific content is replaced or inserted.
"""
import copy, os, re, shutil, zipfile
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

import content as C

TEMPLATE = 'tpl/template.docx'
OUT = 'out/Misk_Leadership_Competency_Assessment_RFP_DRAFT_v1.0.docx'

W = qn('w:t')

# --------------------------------------------------------------------------- utils
def set_text(p, text):
    """Replace a paragraph's text, keeping the first run's formatting."""
    runs = p.findall(qn('w:r'))
    if not runs:
        r = OxmlElement('w:r')
        t = OxmlElement('w:t'); t.set(qn('xml:space'), 'preserve'); t.text = text
        r.append(t); p.append(r)
        return p
    first = runs[0]
    for ch in list(first):
        if ch.tag != qn('w:rPr'):
            first.remove(ch)
    t = OxmlElement('w:t'); t.set(qn('xml:space'), 'preserve'); t.text = text
    first.append(t)
    for r in runs[1:]:
        p.remove(r)
    return p

def clone(ref, text=None, ilvl=None):
    el = copy.deepcopy(ref)
    # drop bookmarks / comment anchors / proofing marks carried over by the copy
    for tag in ('w:bookmarkStart', 'w:bookmarkEnd', 'w:proofErr',
                'w:commentRangeStart', 'w:commentRangeEnd'):
        for e in el.findall(qn(tag)):
            el.remove(e)
    if text is not None:
        set_text(el, text)
    if ilvl is not None:
        pPr = el.find(qn('w:pPr'))
        numPr = pPr.find(qn('w:numPr')) if pPr is not None else None
        if numPr is not None:
            il = numPr.find(qn('w:ilvl'))
            if il is None:
                il = OxmlElement('w:ilvl'); numPr.insert(0, il)
            il.set(qn('w:val'), str(ilvl))
    return el

def insert_after(anchor, elements):
    """Insert elements (in order) directly after anchor; returns the new last anchor."""
    for el in elements:
        anchor.addnext(el)
        anchor = el
    return anchor

def drop(el):
    el.getparent().remove(el)

def page_break_para(ref_empty):
    p = clone(ref_empty)
    for r in p.findall(qn('w:r')):
        p.remove(r)
    r = OxmlElement('w:r'); br = OxmlElement('w:br'); br.set(qn('w:type'), 'page')
    r.append(br); p.append(r)
    return p

# --------------------------------------------------------------------------- load
doc = Document(TEMPLATE)
body = doc.element.body
kids = [ch for ch in body.iterchildren() if ch.tag in (qn('w:p'), qn('w:tbl'))]

def check(i, needle):
    txt = ''.join(kids[i].itertext())
    assert needle in txt, f'index {i}: expected {needle!r}, got {txt[:80]!r}'

check(8, 'Misk Leadership Development')
check(113, 'Misk Leadership Programs')
check(115, 'Early Leadership Development')
check(139, '647 members')
check(141, 'Annexure A')
check(159, 'Project Objectives')
check(161, 'The objective of this RFP')
check(162, 'we are looking for a partner')
check(181, 'Past relevant experiences')
check(183, 'reference number dated and stamped')
check(207, 'Team members’ expertise')
check(238, 'list of suggested team members')
check(309, 'Appendix 2')

# reference elements (deep-copied templates for new content)
REF_NORMAL  = copy.deepcopy(kids[87])    # body text
REF_EMPTY   = copy.deepcopy(kids[89])    # empty Normal
REF_H2      = copy.deepcopy(kids[113])   # Heading 2
REF_B = {0: copy.deepcopy(kids[115]),    # bullet level 0 (numId 1)
         1: copy.deepcopy(kids[117]),    # bullet level 1
         2: copy.deepcopy(kids[118])}    # bullet level 2
REF_SUB     = copy.deepcopy(kids[181])   # Proposal Submission bullet, numId 4 ilvl 1
REF_EVAL    = copy.deepcopy(kids[207])   # Evaluation bullet, numId 5
REF_OBLIG   = copy.deepcopy(kids[238])   # Key Obligations bullet, numId 8

def set_bold(r, on):
    rPr = r.find(qn('w:rPr'))
    if rPr is None:
        rPr = OxmlElement('w:rPr'); r.insert(0, rPr)
    for tag in ('w:b', 'w:bCs'):
        e = rPr.find(qn(tag))
        if e is None:
            e = OxmlElement(tag); rPr.append(e)
        e.set(qn('w:val'), 'true' if on else 'false')

def term_bullet(lvl, text, sep=' – '):
    """Bullet whose lead-in term is bold and whose explanation is regular weight."""
    el = clone(REF_B[min(lvl, 2)], ilvl=lvl)
    head, tail = (text.split(sep, 1) + [''])[:2] if sep in text else (text, '')
    if tail:
        head += sep
    set_text(el, head)
    r0 = el.findall(qn('w:r'))[0]
    set_bold(r0, True)
    if tail:
        r1 = copy.deepcopy(r0)
        for ch in list(r1):
            if ch.tag != qn('w:rPr'):
                r1.remove(ch)
        t = OxmlElement('w:t'); t.set(qn('xml:space'), 'preserve'); t.text = tail
        r1.append(t)
        set_bold(r1, False)
        r0.addnext(r1)
    return el

def set_table_widths(tbl, widths):
    """Fix a cloned table's column widths (twips)."""
    grid = tbl.find(qn('w:tblGrid'))
    for col, w in zip(grid.findall(qn('w:gridCol')), widths):
        col.set(qn('w:w'), str(w))
    tblPr = tbl.find(qn('w:tblPr'))
    tblW = tblPr.find(qn('w:tblW'))
    if tblW is None:
        tblW = OxmlElement('w:tblW'); tblPr.append(tblW)
    tblW.set(qn('w:w'), str(sum(widths))); tblW.set(qn('w:type'), 'dxa')
    for tr in tbl.findall(qn('w:tr')):
        for tc, w in zip(tr.findall(qn('w:tc')), widths):
            tcPr = tc.find(qn('w:tcPr'))
            tcW = tcPr.find(qn('w:tcW'))
            if tcW is None:
                tcW = OxmlElement('w:tcW'); tcPr.insert(0, tcW)
            tcW.set(qn('w:w'), str(w)); tcW.set(qn('w:type'), 'dxa')
    return tbl

def para(text):   return clone(REF_NORMAL, text)
def empty():      return clone(REF_EMPTY)
def h2(text):     return clone(REF_H2, text)
def bullet(lvl, text): return clone(REF_B[min(lvl, 2)], text, ilvl=lvl)

# --------------------------------------------------------- 1. cover page + header
set_text(kids[8], C.COVER_TITLE)

hdr = doc.sections[0].header
for p in hdr.paragraphs:
    for r in p.runs:
        if 'Request for Proposal' in r.text:
            r.text = C.HEADER_TEXT
        elif r.text.strip() in ('5', '202', '2025'):
            r.text = ''

# ------------------------------------------------- 2. About Misk > Leadership Track
set_text(kids[113], C.TRACK_H2)
set_text(kids[114], C.TRACK_INTRO)

new_track = [bullet(lvl, txt) for lvl, txt in C.TRACK_BULLETS]
insert_after(kids[139], new_track)
for i in range(115, 140):
    drop(kids[i])

# closing note + the competency model block, after the Annexure A line
kids[141].addprevious(para(C.TRACK_CLOSING))
kids[141].addprevious(empty())
set_text(kids[141], C.ANNEX_LINE)
anchor = insert_after(kids[141], [empty()])

# ---------------------------------------------- 3. The Misk Leadership Competency Model
blk = [h2(C.MODEL_H2)]
blk += [para(t) for t in C.MODEL_PARAS_1]
blk += [term_bullet(l, t) for l, t in C.PHILOSOPHY_BULLETS]
blk += [empty()]
blk += [para(t) for t in C.MODEL_PARAS_2]
anchor = insert_after(anchor, blk)

# competency table: clone the Key Dates table (Table Grid, 2 columns)
def clone_two_col_table(src_tbl_el, rows):
    """rows[0] is the header row; returns a new <w:tbl> element."""
    tbl = copy.deepcopy(src_tbl_el)
    trs = tbl.findall(qn('w:tr'))
    head_ref, data_ref = trs[0], trs[1]
    for tr in trs:
        tbl.remove(tr)
    def make(ref, values):
        tr = copy.deepcopy(ref)
        for tc, val in zip(tr.findall(qn('w:tc')), values):
            ps = tc.findall(qn('w:p'))
            keep = ps[0]
            for p in ps[1:]:
                tc.remove(p)
            set_text(keep, val)
            for tag in ('w:bookmarkStart', 'w:bookmarkEnd', 'w:proofErr'):
                for e in keep.findall(qn(tag)):
                    keep.remove(e)
        return tr
    tbl.append(make(head_ref, rows[0]))
    for values in rows[1:]:
        tbl.append(make(data_ref, values))
    return tbl

KEY_DATES_TBL = kids[49]
comp_tbl = set_table_widths(clone_two_col_table(KEY_DATES_TBL, C.COMPETENCY_TABLE), (3100, 6790))
anchor = insert_after(anchor, [comp_tbl, empty()])
anchor = insert_after(anchor, [para(t) for t in C.MODEL_PARAS_3])
anchor = insert_after(anchor, [term_bullet(l, t) for l, t in C.FLEX_BULLETS])
anchor = insert_after(anchor, [empty()])
anchor = insert_after(anchor, [para(t) for t in C.MODEL_PARAS_4])

# replace the block of filler empties before "Project Objectives" with a page break
for i in range(142, 159):
    drop(kids[i])
insert_after(anchor, [page_break_para(REF_EMPTY)])

# ------------------------------------------------------------ 4. Project Objectives
set_text(kids[161], C.PO_PARAS[0])
set_text(kids[162], C.PO_PARAS[1])

blk = [empty(), h2(C.NEED_H2), para(C.NEED_INTRO)]
blk += [term_bullet(l, t) for l, t in C.NEED_BULLETS]
blk += [empty(), h2(C.USES_H2), para(C.USES_INTRO)]
blk += [term_bullet(l, t) for l, t in C.USES_BULLETS]
blk += [empty(), h2(C.POP_H2), para(C.POP_INTRO)]
insert_after(kids[162], blk)
anchor = blk[-1]

pop_tbl = set_table_widths(clone_two_col_table(KEY_DATES_TBL, C.POP_TABLE), (5800, 4090))
anchor = insert_after(anchor, [pop_tbl, empty(), h2(C.DELIV_H2), para(C.DELIV_INTRO)])

# ------------------------------------------------------------- 5. Scope of Work table
scope_tbl = kids[163]
# same overall width and indent as the template; columns rebalanced for the new content
set_table_widths(scope_tbl, (509, 1750, 3800, 2500, 2691))
trs = scope_tbl.findall(qn('w:tr'))
head_tr, row_ref = trs[0], copy.deepcopy(trs[1])

# reference paragraphs taken from inside the table so cell formatting is preserved
_ref_cells = row_ref.findall(qn('w:tc'))
REF_TC_NUM    = copy.deepcopy(_ref_cells[0].findall(qn('w:p'))[0])   # centred "1."
REF_TC_TITLE  = copy.deepcopy(_ref_cells[1].findall(qn('w:p'))[0])   # scope title
REF_TC_PLAIN  = copy.deepcopy(_ref_cells[2].findall(qn('w:p'))[0])   # plain cell text
REF_TC_BULLET = copy.deepcopy(_ref_cells[3].findall(qn('w:p'))[0])   # bulleted cell text

for tr in trs[1:]:
    scope_tbl.remove(tr)

def fill_cell(tc, blocks):
    for p in tc.findall(qn('w:p')):
        tc.remove(p)
    for kind, text in blocks:
        ref = REF_TC_BULLET if kind == 'b' else REF_TC_PLAIN
        tc.append(clone(ref, text))
    # a table cell must end with a paragraph - guaranteed by the loop above
    tcPr = tc.find(qn('w:tcPr'))
    if tcPr is not None:
        tc.remove(tcPr); tc.insert(0, tcPr)

anchor_tr = head_tr
for no, title, details, assumptions, deliverables in C.SCOPE_ROWS:
    tr = copy.deepcopy(row_ref)
    tcs = tr.findall(qn('w:tc'))
    # cells 0 and 1 use their own reference paragraphs
    for p in tcs[0].findall(qn('w:p')):
        tcs[0].remove(p)
    tcs[0].append(clone(REF_TC_NUM, no))
    for p in tcs[1].findall(qn('w:p')):
        tcs[1].remove(p)
    tcs[1].append(clone(REF_TC_TITLE, title))
    fill_cell(tcs[2], details)
    fill_cell(tcs[3], assumptions)
    fill_cell(tcs[4], deliverables)
    anchor_tr.addnext(tr)
    anchor_tr = tr

# ------------------------------------------------------------ 6. Proposal Submission
# the checklist sits on page four in this document
for _t in kids[173].iter(qn('w:t')):
    if _t.text and 'page two' in _t.text:
        _t.text = _t.text.replace('Bidder checklist on page two',
                                  'Bidder checklist on page four')

insert_after(kids[181], [clone(REF_SUB, t, ilvl=1) for t in C.TECH_PROPOSAL_EXTRA])
set_text(kids[183], C.FINANCIAL_RATE_LINE)

# ---------------------------------------------------------- 7. Evaluation / Obligations
insert_after(kids[207], [clone(REF_EVAL, t) for t in C.EVAL_EXTRA])
insert_after(kids[238], [clone(REF_OBLIG, t) for t in C.KEY_OBLIGATIONS_EXTRA])

# ------------------------------------------------------------------- 8. Appendix 2
app2 = [para(C.APPENDIX2_INTRO)] + [term_bullet(0, t, sep=': ') for t in C.APPENDIX2_ITEMS]
insert_after(kids[310], app2)

# --------------------------------------------------------- 9. strip review comments
for tag in ('w:commentRangeStart', 'w:commentRangeEnd'):
    for e in body.iter(qn(tag)):
        e.getparent().remove(e)
for r in list(body.iter(qn('w:r'))):
    if r.find(qn('w:commentReference')) is not None:
        r.getparent().remove(r)

# ------------------------------------------------------- 10. force TOC update on open
settings = doc.settings.element
if settings.find(qn('w:updateFields')) is None:
    uf = OxmlElement('w:updateFields'); uf.set(qn('w:val'), 'true')
    settings.append(uf)

cp = doc.core_properties
cp.title = 'Request for Proposal (RFP) - Misk Leadership Competency Assessment'
cp.subject = 'Development of a customized leadership competency assessment for the Misk Leadership Track'
cp.comments = ''
cp.last_modified_by = 'Misk Foundation'

os.makedirs('out', exist_ok=True)
doc.save(OUT)

# ------------------------------------- 11. drop the comment parts from the package
tmp = OUT + '.tmp'
DROP = {'word/comments.xml', 'word/commentsExtended.xml', 'word/commentsIds.xml',
        'word/commentsExtensible.xml', 'word/people.xml'}
with zipfile.ZipFile(OUT) as zin, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        if item.filename in DROP:
            continue
        data = zin.read(item.filename)
        if item.filename == '[Content_Types].xml':
            s = data.decode('utf-8')
            for part in DROP:
                s = re.sub(r'<Override PartName="/%s"[^>]*/>' % re.escape(part), '', s)
            data = s.encode('utf-8')
        elif item.filename == 'word/_rels/document.xml.rels':
            s = data.decode('utf-8')
            for part in DROP:
                base = part.split('/')[-1]
                s = re.sub(r'<Relationship[^>]*Target="%s"[^>]*/>' % re.escape(base), '', s)
            data = s.encode('utf-8')
        zout.writestr(item, data)
shutil.move(tmp, OUT)

print('written:', OUT, os.path.getsize(OUT), 'bytes')
