# SLS Annual Assembly 2026

The 2026 assembly is a **one-day event for the whole SLS membership, with no graduation
segment** — a change from 2024, when the assembly was combined with the 2030 Leaders
graduation. Two deliverables live here.

| File | What it is |
|---|---|
| `SLS_Annual_Assembly_2026_Event_Charter.pptx` (`.pdf`) | The Misk **New Event Charter** template, filled in. The approval document: scope of work, project timeline, stakeholders, budget lines, risk register. |
| `experience/SLS_Annual_Assembly_2026_Concept_Note.pdf` | The concept note as an 8-page A4 PDF, for circulation. |
| `experience/concept-note.html` | The concept note — objective, theme, format, programme segments, recognition approach. The short document to circulate. Published at <https://claude.ai/code/artifact/1c8a87d9-148c-4a9f-bd24-f8b01c478bcd>. |
| `experience/assembly.html` | The experience design. Full run of show, the network graph as the spine of the day, the five pillars placed into formats, and the recommendations. Published at <https://claude.ai/code/artifact/fbc3f063-f7d9-4cc1-92a3-542080a25590>. |

Both are built from the same two inputs: the 2026 brief (Hena Experience Center, all SLS
members invited, around 400 confirming, an interactive network graph the Track already has)
and the **SLS 2030 Leaders Graduation 2024 post-event report**.

## Recognition is the centre of gravity

The Assembly is SLS's moment to recognise the partners, Council members, Chapter teams and
contributors who carried the year. That is the concept note's organising idea, and it drives
one structural decision worth stating here: **recognition is designed at three volumes rather
than run as an awards block.** Four groups is likely sixty-plus names, and sixty walks to a stage
is forty minutes of applause fatigue against a survey item that already scored 69.8%.

| Tier | Who | Mechanism |
|---|---|---|
| 1 | Everyone, ~60+ names | The Wall of the Year at the entrance, grouped by contribution rather than rank |
| 2 | Four groups | Recognised inside the segment they belong to — partners at the impact segment, Chapter teams as teams, Council at the roadmap handover, contributors on screen through dinner |
| 3 | One | A peer-nominated honour, nominated by members four weeks out through the attendance-confirmation flow |

Plus **the letter home** — a letter from SLS leadership to the board or CEO of each honoured
contributor's organisation. It costs a signature and outlives anything that goes on a shelf.

## The read on 2024

Overall satisfaction was 76.8%. Underneath it the survey splits cleanly, and the split decides
where 2026's effort goes:

| | 2024 |
|---|---|
| Wayfinding and signage | 92.2% |
| Getting to the venue | 88.7% |
| The venue itself | 84.6% |
| Information before the event | 83.0% |
| Registration process | 79.3% |
| **Networking opportunities** | **74.5%** |
| **Agenda structure and flow** | **69.8%** |

Every operational item scored 79% or better; both programme items scored below 75%. So the
charter holds operations to the standard already set and spends the new effort on the programme
and the connections.

## What 2024 changed in the charter

| 2024 finding | Where it lands |
|---|---|
| Venue accessible only after 16:00; one more load-in day would have helped | Three-day exclusive build (18–20/11), site survey before signature |
| Power cut took the LED screen down hours before doors | Standby generator and UPS on critical AV in scope; bonded internet with failover for the graph wall |
| Outer signage, valet, photo drop, translator, cleaners missing from the RFP, returning as change requests | All five named in the scope of work |
| Badges required a prior pick-up trip | Digital badge, no advance pick-up, on-site desk on the day |
| Catering built for 400; 150–200 were there by the end | Catering and seating to a headcount reconfirmed 48 hours out — the top risk on the register |
| Theatre over-ran; half the audience left; hard to regather after a break | 120 minutes seated out of 390, run once and unbroken at the end |
| Networking rated second-lowest | The graph, the Impact Market and the peer circles; introductions delivered with a place and a time |
| Production ran through Ramadan and Eid | November date, production window clear of Ramadan 2027 |

## Assumptions

Not in the brief. Each is a single-cell edit if the Track sees it differently.

- **Date — Saturday 21/11/2026, 14:30–21:00.** 2024 ran on a Saturday. November gives Riyadh
  weather that suits outdoor networking and keeps production clear of Ramadan.
- **New-member induction, not graduation.** The brief rules out a graduation, but the pillar list
  asks for the latest Misk Fellowship and 2030 Leaders cohorts to be welcomed. This is scoped as a
  fifteen-minute induction into the society — named, paired with a sponsor member, no procession
  and no certificates. Nothing else in the day depends on it, so it can be cut outright.
- **Headcount split.** "# of Attendees" and "Participant Numbers" both read 400, on the reading
  that every attendee is a member. If guests, speakers or crew sit on top, the first should rise.
- **Level of attendees.** Key CEOs, Partners and Beneficiaries ticked; Royal Highnesses and Public
  left blank on a private, invitation-only event.
- **CEO required, DCEO not.**
- **Both risk entries marked as risks**, not issues — neither has materialised.

## Open items

- **Budget.** Amounts and cost-centre codes are `TBC`. The template's own footnote warns that an
  event without correct budgets in the correct cost centre will not be approved on the event
  system, so these need the Track's real figures before submission.
- **Names.** Event Sponsor, Event Manager and every stakeholder role read `[TBC]`.
- **Venue.** Hena Experience Center is marked *(proposed)* pending the site survey.
- **Graph data.** Member profiles, sectors and contact consent need to be current before
  invitations go out — the whole digital spine depends on it.
- **Events Comments** is left at `N/A` — that box belongs to EMU.

## Rebuilding the charter

`source/fill_charter.py` writes the deck from the blank template, so a change of date or wording
is an edit to the script rather than to slide XML. Run it from a directory holding the blank
`New_Event_Charter.pptx` saved as `charter_template.pptx`:

```
pip install python-pptx
python3 fill_charter.py
```

It clones each template paragraph's own formatting, so the Misk styling, Codec Pro type and the
green/amber/black ownership colour coding survive untouched. One deliberate correction: the
template ships the budget **Amount (pre-VAT)** cells as white text on a white fill, which makes
anything written there invisible; the script recolours those runs to the same grey as the
neighbouring cells.

> Note on layout: the deck is proofed against a LibreOffice render, which substitutes a wider
> font for Codec Pro. Long template labels ("Interdependent Events / Programs", "Partcipent
> Numbers") wrap further there than they will in PowerPoint, so the Main Information table sits
> slightly lower in the preview than in the real file — the blank template does the same.
