# Power BI setup

Two routes. Route A works today; route B needs credentials from you.

---

## Route A — dataset export + Power Query script (working now)

The dashboard exposes an 8-table **star schema**, which is the shape Power BI's modelling engine wants.

| Table | Grain | Key |
|---|---|---|
| `fact_engagement` | one logged engagement-hour entry | `log_id` |
| `fact_attendance` | one member at one event, with scan stamps | `attendance_id` |
| `fact_startup` | one supported startup | `startup_id` |
| `dim_member` | member, cohort, sector, mentor | `member_id` |
| `dim_initiative` | initiative, pillar, owning council role | `initiative_id` |
| `dim_event` | event, type, duration, satisfaction | `event_id` |
| `dim_date` | one row per day across the data | `date_key` |
| `dim_activity_rule` | activity type → default hours | `activity_type` |

`dim_activity_rule` is included deliberately: it means the hours logic is visible *inside* Power BI, not a
black box upstream of it.

### Steps

1. Start the app (`npm run dev`). Note the API's address — `http://localhost:4317` by default.
2. In the dashboard, go to **Exports**, set the filter bar to the period you want, and click
   **↓ Power Query script (.m)**. (The exported script bakes in the current date filter; other filters are
   deliberately left out so the Power BI model holds the full dimensional data and you filter inside Power BI.)
3. Open **Power BI Desktop** → *Home* → *Get data* → **Blank query**.
4. *Home* → **Advanced Editor**. Delete what's there, paste the script, click **Done**.
5. *Home* → **Close & Apply**.
6. In **Model view**, create these relationships (all many-to-one, single direction, from fact to dimension):

   | From | To |
   |---|---|
   | `fact_engagement[member_id]` | `dim_member[member_id]` |
   | `fact_engagement[initiative_id]` | `dim_initiative[initiative_id]` |
   | `fact_engagement[event_id]` | `dim_event[event_id]` |
   | `fact_engagement[date_key]` | `dim_date[date_key]` |
   | `fact_attendance[member_id]` | `dim_member[member_id]` |
   | `fact_attendance[event_id]` | `dim_event[event_id]` |
   | `fact_startup[member_id]` | `dim_member[member_id]` |
   | `dim_event[initiative_id]` | `dim_initiative[initiative_id]` |

7. Select `dim_date` → *Table tools* → **Mark as date table** → `date_key`. (Without this, time-intelligence
   DAX like `SAMEPERIODLASTYEAR` will not work.)
8. Add the measures below.
9. **To create the `.pbit` template:** *File* → *Save as* → change the type to **Power BI template (\*.pbit)**.
   You now have a template you know opens, because you just made it.

### Measures to paste in

```dax
Total Hours          = SUM(fact_engagement[hours])
Auto-captured Hours  = CALCULATE([Total Hours], fact_engagement[source] IN {"auto-calculated","qr"})
Automation Rate      = DIVIDE([Auto-captured Hours], [Total Hours])
Verified Hours       = CALCULATE([Total Hours], fact_engagement[verified_flag] = 1)
Verification Rate    = DIVIDE([Verified Hours], [Total Hours])
Engaged Members      = DISTINCTCOUNT(fact_engagement[member_id])
Hours per Member     = DIVIDE([Total Hours], [Engaged Members])
Total Members        = DISTINCTCOUNT(dim_member[member_id])
Member Reach %       = DIVIDE([Engaged Members], [Total Members])
Events Held          = DISTINCTCOUNT(fact_attendance[event_id])
Event Attendees      = SUM(dim_event[attendee_count])
Startups Supported   = DISTINCTCOUNT(fact_startup[startup_id])
Hours LY             = CALCULATE([Total Hours], SAMEPERIODLASTYEAR(dim_date[date_key]))
Hours YoY %          = DIVIDE([Total Hours] - [Hours LY], [Hours LY])
```

### Visuals that mirror the dashboard

| Dashboard chart | Power BI equivalent |
|---|---|
| Engagement hours over time | Area chart — `dim_date[year_month]` × `[Total Hours]` |
| Hours by pillar | Bar chart — `dim_initiative[pillar]` × `[Total Hours]` |
| Hours by activity type | Bar chart — `fact_engagement[activity_type]` × `[Total Hours]` |
| Hours by cohort | Donut — `dim_member[cohort_type]` × `[Total Hours]` |
| Initiative performance | Table — `dim_initiative[name]`, `[Events Held]`, `[Total Hours]`, `[Member Reach %]` |
| Engagement leaderboard | Table — `dim_member[name]`, `[Total Hours]`, sorted descending |
| Automation KPI | Card — `[Automation Rate]` |

Use the same brand hexes from `design-tokens.json` for the Power BI theme so the two surfaces match.

### Refreshing

The queries point at live API URLs, so **Refresh** in Power BI Desktop re-pulls current data.

For scheduled refresh in the Power BI **Service**, the API must be reachable from the service. Either
deploy the app to a URL the service can reach, or install an **on-premises data gateway** on a machine that
can reach it. Set `SLS_PUBLIC_URL` on the server so generated scripts use the right public address:

```bash
SLS_PUBLIC_URL=https://sls-datacenter.internal.example npm start
```

### Plain CSV/JSON instead

Every table is also individually downloadable from **Exports**, or directly:

```
GET /api/export/powerbi/table?name=fact_engagement&format=csv
GET /api/export/powerbi/table?name=dim_member&format=json
GET /api/export/csv/fact_engagement
```

All accept the same filter query string as the dashboard.

---

## Route B — live push-dataset via the Power BI REST API (needs credentials)

**Current status: not implemented.** The dataset definition and row shaping are done; the OAuth exchange
and row-push calls are not, because they cannot be built or tested without your tenant.

### What you need to supply

| Credential | Where it comes from | Where to put it |
|---|---|---|
| `POWERBI_CLIENT_ID` | Azure AD app registration → *Application (client) ID* | Settings → Other API keys |
| `POWERBI_CLIENT_SECRET` | Azure AD app registration → *Certificates & secrets* | Settings → Other API keys |
| `POWERBI_TENANT_ID` | Azure AD → *Directory (tenant) ID* | Settings → Other API keys |
| Workspace ID | The GUID in the Power BI workspace URL | Settings → Power BI |
| Dataset ID | Returned when the push dataset is created | Settings → Power BI |

Each can also be supplied as an environment variable of the same name.

### Azure-side setup

1. **Azure Portal** → *App registrations* → **New registration**. Single tenant is fine.
2. *Certificates & secrets* → **New client secret**. Copy the value immediately.
3. *API permissions* → **Power BI Service** → *Application permissions* → `Tenant.ReadWrite.All`
   (or the narrower `Dataset.ReadWrite.All`) → **Grant admin consent**.
4. **Power BI Admin portal** → *Tenant settings* → enable
   **"Allow service principals to use Power BI APIs"** and add your app's security group.
5. In the target **workspace** → *Access* → add the service principal as **Member** or **Admin**.

### What remains to be implemented

In `server/src/lib/powerbi.ts`:

1. **Token exchange** — `POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`
   with `grant_type=client_credentials` and `scope=https://analysis.windows.net/powerbi/api/.default`.
2. **Create the dataset once** — `POST https://api.powerbi.com/v1.0/myorg/groups/{workspaceId}/datasets`
   with the body from `pushDatasetDefinition()`, which already generates the correct table/column schema
   with inferred data types. Store the returned dataset id in Settings.
3. **Push rows** — for each table, `POST .../datasets/{datasetId}/tables/{table}/rows` with
   `{ "rows": buildTable(name, filters) }`. Push-dataset rows cap at 10,000 per request, so chunk
   `fact_engagement`; call the `DELETE .../rows` endpoint first for a full replace.
4. **Schedule it** — a cron or an endpoint your scheduler hits.

Once the credentials are stored, the Exports page reports them as present and names this as the remaining step.

**A simpler alternative worth considering:** route A with a gateway gives you scheduled refresh without any
Azure app registration. Push datasets are worth the setup only if you need sub-hourly, near-real-time refresh.
