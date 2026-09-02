# SLS Annual Assembly 2026 — Event Charter

`SLS_Annual_Assembly_2026_Event_Charter.pptx` is the Misk **New Event Charter** template
filled in for the 2026 assembly. A PDF export sits beside it for quick review.

Two inputs shaped it: the brief for 2026 (Hena Experience Center, all SLS members invited,
around 400 confirming) and the **SLS 2030 Leaders Graduation 2024 post-event report**, whose
lessons learned are carried into the scope of work, the timeline and the risk register rather
than left to be rediscovered.

## What 2024 changed in this charter

| 2024 finding | Where it lands in the 2026 charter |
|---|---|
| Venue accessible only after 16:00; one more load-in day would have helped | Three-day exclusive build (18–20/11) contracted, site survey before signature |
| Power cut took the LED screen down hours before doors | Standby generator and UPS on critical AV written into the scope |
| Outer signage, valet, photo drop, translator and cleaners were missing from the RFP and came back as change requests | All five named explicitly in the scope of work |
| Badges required a prior pick-up, inconvenient for guests travelling from outside Riyadh | Digital badge, no advance pick-up, on-site desk on the day |
| Catering built for 400; 150–200 were in the garden by the time the theatre ended | Catering and seating contracted to a headcount reconfirmed 48 hours out, with staged release — logged as the top risk |
| Theatre programme over-ran; half the audience left; hard to regather after a break | Capped plenary, one continuous run, prayer breaks planned around Maghrib and Isha |
| Networking rated lowest of all elements (74.5%) | Networking activations run across the venue, not only between segments |
| Production ran through Ramadan and Eid; graduation wanted earlier for better weather | November date, production window clear of Ramadan 2027 |
| Overall satisfaction 77%; 320 of 468 registrants attended | Objective states the targets to beat: 85% satisfaction, 85% of confirmed guests attending |

## Assumptions made

These were not in the brief. Each is a single-cell edit if the Track sees it differently.

- **Date — Saturday 21/11/2026, 16:00–21:30.** 2024 ran on a Saturday (27/04). November gives
  Riyadh weather that suits outdoor networking, and keeps production clear of Ramadan.
  Build 18–20/11, dismantle to 23/11, charter-to-event window about ten weeks.
- **Scope — assembly only, no graduation.** The 2024 edition combined the Assembly with the
  2030 Leaders graduation, and attendees said it felt too heavily focused on 2030. This charter
  scopes the Assembly on its own and lists the graduation as an interdependency. Combining
  the two again changes the guest-per-graduate allocation, the run of show and the timeline.
- **Headcount split.** "# of Attendees" and "Participant Numbers" both read 400, on the reading
  that every attendee is an SLS member. If the Track expects guests, speakers or crew on top,
  the first number should rise.
- **Level of attendees.** Key CEOs, Partners and Beneficiaries ticked; Royal Highnesses and
  Public left blank on a private, invitation-only event.
- **CEO required, DCEO not.** Flagship annual convening. Flip if DCEO participation is planned.
- **Both risk entries marked as risks**, not issues — neither has materialised yet.

## Open items

- **Budget.** Amounts and cost-centre codes are `TBC`. The template's own footnote warns that an
  event without correct budgets in the correct cost centre will not be approved on the event
  system, so these need the Track's real figures before submission.
- **Names.** Event Sponsor, Event Manager and every stakeholder role read `[TBC]`.
- **Venue.** Hena Experience Center is marked *(proposed)* pending the site survey.
- **Events Comments** is left at `N/A` — that box belongs to EMU.

## Rebuilding

`source/fill_charter.py` writes the deck from the blank template, so a change of date or wording
is an edit to the script rather than to slide XML. Run it from a directory holding the blank
`New_Event_Charter.pptx` saved as `charter_template.pptx`:

```
pip install python-pptx
python3 fill_charter.py
```

It clones each template paragraph's own formatting, so the Misk styling, Codec Pro type and the
green/amber/black ownership colour coding survive untouched.

> Note on layout: the deck is proofed against a LibreOffice render, which substitutes a wider
> font for Codec Pro. Text sits comfortably inside every box there, so it will sit more
> comfortably still in PowerPoint with the real font installed.
