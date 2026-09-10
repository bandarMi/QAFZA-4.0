# -*- coding: utf-8 -*-
"""The two RFP options.

Option A puts the Foundation's existing Leadership Track competency model in front
of Bidders and asks them to review, calibrate, and build an assessment against it.

Option B says nothing about an existing model. It asks Bidders to analyse the
Leadership Track and develop the competency model themselves, then build the
assessment against what they develop.
"""
import copy

import content as C

# =============================================================================
# Option B - develop a new competency model from an analysis of the Track
# =============================================================================

TRACK_CLOSING_B = ("This RFP addresses the Leadership Track in its entirety. The Foundation is seeking a partner to "
                   "work across all of these programs rather than for any single one of them.")

CASE_H2 = "The Case for a Leadership Track Competency Model"

CASE_PARAS = [
    ("The programs above have grown as a portfolio. Each has its own target audience, selection criteria, "
     "curriculum, and measures of success, and each describes leadership in its own terms. The Foundation now "
     "requires a single leadership competency model that spans the whole Track: one shared definition of what good "
     "leadership looks like for the Saudi leaders who will deliver Vision 2030, expressed at proficiency levels "
     "appropriate to each stage, from students and early-career talent, through first-level leaders, to senior "
     "executives and the alumni community."),
    ("A Track-wide model would allow the Foundation to select consistently across its programs, to describe a "
     "beneficiary’s development in the same language whichever program they join, to aggregate competency data "
     "across programs, cohorts, and years, and to evidence the growth its programs produce."),
    ("The Foundation has deliberately not prescribed the competencies in this RFP. Bidders are expected to arrive "
     "at them through their own research and through analysis of the Leadership Track, the Foundation’s ambitions, "
     "and the Saudi leadership context, and to justify the model they propose on the evidence they gather. Program "
     "curricula, learning objectives, selection criteria, and beneficiary and alumni population data will be made "
     "available to support that work."),
    ("The number of competencies, their structure, their naming, and the language in which they are expressed are "
     "for the Bidder to propose and for the Foundation to approve."),
]

GOALS_PARAS_B = [
    ("The Misk Leadership Competency Model and Assessment Project aims, first, at developing a leadership "
     "competency model for the Foundation’s Leadership Track, grounded in research and in analysis of the Track’s "
     "programs, beneficiaries, and objectives and, second, at designing, developing, and validating a customized "
     "assessment against that model, delivering the assessment as a fully operational digital tool, and training "
     "the Foundation’s team and other nominated members to use the tool independently and to a professional "
     "standard."),
    C.GOALS_PARAS[1],
]

NEED_INTRO_B = ("Off-the-shelf leadership assessments are built on vendors’ own global competency frameworks. They "
                "are not designed for the Saudi leadership context, they measure constructs the Foundation has not "
                "chosen, and they do not produce data that can be aggregated meaningfully across the Leadership "
                "Track. The Foundation therefore requires an assessment that is purpose-built around the competency "
                "model developed under this engagement. The assessment shall:")

NEED_BULLETS_B = [
    (0, "Measure the Foundation’s own model directly – items, scales, scoring, and reports mapped one-to-one to the competencies and behavioural indicators developed under this engagement, rather than mapped indirectly onto a Vendor’s proprietary framework."),
    (0, "Be valid in the Saudi context – developed, piloted, and normed on Saudi and regional leader populations, with culturally appropriate scenarios, content, and language."),
    (0, "Be fully bilingual – Arabic and English versions of equal psychometric quality, developed and validated in parallel rather than translated from a single source version."),
    (0, "Be calibrated across leadership levels – one architecture, expressed at proficiency levels appropriate to early leaders, young professionals, first-level leaders, senior leaders, and executives."),
    (0, "Be owned by the Foundation – the Foundation shall own the competency model, the customized assessment content, item bank, scoring rules, norms, reports, and all data generated, with any underlying Vendor engine or platform licensed on clearly stated terms."),
    (0, "Be sustainable in-house – the Foundation’s team shall be able to administer, interpret, debrief, and report on the assessment without depending on the Vendor for routine operation."),
    (0, "Be compliant – aligned with the Personal Data Protection Law (PDPL) of the Kingdom of Saudi Arabia, the Foundation’s information security requirements, and recognised professional standards for the fair use of assessments."),
]

USES_BULLETS_B = [
    (lvl, txt.replace("against the seven competencies", "against the competency model"))
    for lvl, txt in C.USES_BULLETS
]

DURATION_TEXT_B = ("The duration of project implementation shall be approximately fourteen (14) months from the "
                   "project kick-off, followed by a support and continuous improvement period to be proposed by the "
                   "Vendor. The indicative phasing below is provided for guidance. Bidders shall propose their own "
                   "timeline against these phases, state clearly any dependency on the Foundation, and identify the "
                   "stage gates at which the Foundation’s approval is required.")

PHASE_TABLE_B = [
    ("Phase", "Timeframe"),
    ("Phase 1 – Mobilisation, Leadership Track analysis, and stakeholder engagement", "Months 1-4"),
    ("Phase 2 – Competency model design, stakeholder validation, and Foundation sign-off", "Months 4-6"),
    ("Phase 3 – Assessment design, item development, and bilingual content build", "Months 6-9"),
    ("Phase 4 – Pilot administration, psychometric validation, norming, and refinement", "Months 9-12"),
    ("Phase 5 – Tool configuration, integration, testing, and go-live", "Months 10-13"),
    ("Phase 6 – Training, certification, and train-the-trainer", "Months 12-14"),
    ("Phase 7 – Rollout across the Leadership Track, support, and annual review", "Month 14 onwards"),
]

SCOPE_ROW1_B = (
    "1.", "Competency Model",
    [("p", "The objective of this scope is to research, design, and develop a leadership competency model for the Misk Leadership Track, grounded in evidence and validated with the Foundation."),
     ("p", "The Vendor shall:"),
     ("b", "Analyse the Leadership Track in depth, including the objectives, target audiences, curricula, selection criteria, and intended outcomes of each program, and the profile of the beneficiaries and alumni each program serves."),
     ("b", "Conduct stakeholder engagement through interviews and focus groups with Foundation leadership, program owners, faculty, alumni, and a sample of beneficiaries and their sponsoring organisations."),
     ("b", "Analyse the Saudi leadership context, including the demands Vision 2030 places on leaders across the public, private, and non-profit sectors, and the leadership behaviours that differentiate high performance in the Kingdom."),
     ("b", "Conduct role and behavioural analysis appropriate to each leadership level represented in the Track, using recognised competency modelling methods such as behavioural event interviewing, critical incident technique, repertory grid, or equivalent, and state the methods used and why."),
     ("b", "Benchmark against recognised leadership frameworks and against comparable national leadership programs, and set out clearly what the Foundation’s model draws from them and where it deliberately differs."),
     ("b", "Propose the competency architecture: the competencies themselves, their definitions, their clusters or groupings if any, observable behavioural indicators, and proficiency levels for early leaders, young professionals, first-level leaders, senior leaders, and executives."),
     ("b", "Justify the proposed model against the evidence gathered, and set out the alternatives considered and why they were not taken forward."),
     ("b", "Produce a bilingual competency dictionary and present the model to the Foundation for approval before assessment design begins.")],
    [("b", "The Foundation shall provide program materials, curricula, selection criteria, population data, and access to stakeholders."),
     ("b", "The Vendor shall develop a model specific to the Foundation. A standard vendor framework relabelled for Misk shall not be acceptable."),
     ("b", "The number of competencies, their structure, and their naming are for the Vendor to propose and for the Foundation to approve."),
     ("b", "All outputs shall be delivered in both Arabic and English."),
     ("b", "The approved model shall be signed off by the Foundation as a stage gate before Scope 2 commences.")],
    [("b", "Research and analysis report covering the Leadership Track, the stakeholder engagement, and the Saudi leadership context."),
     ("b", "Benchmarking report."),
     ("b", "Proposed leadership competency model, with definitions, behavioural indicators, and proficiency levels by leadership level, and the evidence and rationale behind each competency."),
     ("b", "Bilingual competency dictionary."),
     ("b", "Stakeholder validation workshop and approved sign-off document.")])

_MODEL_PHRASES = [
    ("the Misk leadership competency model", "the approved competency model"),
    ("the Misk competency model", "the approved competency model"),
    ("the seven competencies", "the competencies"),
    ("seven competencies", "competencies"),
]

def _scope_rows_b():
    rows = [copy.deepcopy(r) for r in C.SCOPE_ROWS[1:]]
    out = [SCOPE_ROW1_B]
    for no, title, details, assumptions, deliverables in rows:
        def fix(blocks):
            fixed = []
            for kind, text in blocks:
                for old, new in _MODEL_PHRASES:
                    text = text.replace(old, new)
                fixed.append((kind, text))
            return fixed
        out.append((no, title, fix(details), fix(assumptions), fix(deliverables)))
    return out

SCOPE_ROWS_B = _scope_rows_b()

ELEMENTS_TEAM_B = [
    (0, "Please provide the profiles of named key personnel who would be assigned to the project, including the competency modelling lead, the lead psychometrician or occupational psychologist, the Arabic-language assessment lead, the technology or platform lead, and the training lead."),
] + C.ELEMENTS_TEAM[1:]

ELEMENTS_TECHNICAL_B = [
    (0, "Vendor is expected to provide a detailed methodology on project implementation and delivery, including the competency research and modelling approach, the assessment methods proposed, the item development process, the validation design, and the structure of data storage and software used."),
    (0, "Vendor shall describe the competency modelling methods it will use, the evidence base it will draw on, and how it will demonstrate that the resulting model is valid for the Leadership Track and for the Saudi leadership context."),
] + C.ELEMENTS_TECHNICAL[1:]

EVAL_EXTRA_B = [
    "Rigour of the competency modelling methodology and the evidence behind the proposed model",
    "Psychometric rigour and strength of the evidence of validity presented",
    "Depth of grounding in the Leadership Track and the Saudi leadership context",
    "Arabic-language assessment development capability",
    "Data protection, information security, and compliance",
]

KEY_OBLIGATIONS_EXTRA_B = [
    ("The Vendor shall transfer to the Foundation full ownership of the competency model developed under this "
     "engagement, together with the customized assessment content, item bank, scoring rules, norms, report "
     "templates, and all data generated, and shall state clearly in the proposal any underlying licensed "
     "components together with their terms."),
    C.KEY_OBLIGATIONS_EXTRA[1],
]

APPENDIX2_ITEMS_B = [
    "Annexure A: Misk Leadership Track – program profiles, objectives, target audiences, and annual beneficiary volumes.",
    "Annexure B: Leadership Track curricula, learning objectives, and selection criteria.",
    "Annexure C: Beneficiary and alumni population profiles.",
    "Annexure D: The Foundation’s information security and personal data protection requirements.",
    "Annexure E: Rate card template.",
]

# =============================================================================
VARIANTS = {
    'A': dict(
        out_name='Misk_Leadership_Competency_Model_and_Assessment_RFP_v1.0.docx',
        track_closing=C.TRACK_CLOSING_2,
        model_section=True,
        goals_paras=C.GOALS_PARAS,
        need_intro=C.NEED_INTRO,
        need_bullets=C.NEED_BULLETS,
        uses_bullets=C.USES_BULLETS,
        duration_text=C.DURATION_TEXT,
        phase_table=C.PHASE_TABLE,
        scope_rows=C.SCOPE_ROWS,
        elements_team=C.ELEMENTS_TEAM,
        elements_technical=C.ELEMENTS_TECHNICAL,
        eval_extra=C.EVAL_EXTRA_2,
        key_obligations_extra=C.KEY_OBLIGATIONS_EXTRA,
        appendix2_items=C.APPENDIX2_ITEMS,
    ),
    'B': dict(
        out_name='Misk_Leadership_Competency_RFP_Option_B_New_Model_v1.0.docx',
        track_closing=TRACK_CLOSING_B,
        model_section=False,
        goals_paras=GOALS_PARAS_B,
        need_intro=NEED_INTRO_B,
        need_bullets=NEED_BULLETS_B,
        uses_bullets=USES_BULLETS_B,
        duration_text=DURATION_TEXT_B,
        phase_table=PHASE_TABLE_B,
        scope_rows=SCOPE_ROWS_B,
        elements_team=ELEMENTS_TEAM_B,
        elements_technical=ELEMENTS_TECHNICAL_B,
        eval_extra=EVAL_EXTRA_B,
        key_obligations_extra=KEY_OBLIGATIONS_EXTRA_B,
        appendix2_items=APPENDIX2_ITEMS_B,
    ),
}
