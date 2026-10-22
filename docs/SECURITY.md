# Security and operations

This is Hopr's threat model: what it protects, from whom, how, and what risk is accepted. It ends with how to run it safely in production. Section 8 of [TECHNICAL.md](TECHNICAL.md) lists the controls in detail.

## 1. What needs protecting

| Asset | Where it lives | Why it matters |
|---|---|---|
| Customer details: names, phone numbers, addresses | MongoDB (route stops); the driver's phone while a route is in progress | Personal data |
| Live driver location | MongoDB (`driverLocation`), the customer tracking page | Physical safety of drivers |
| Proof of delivery: photos and signatures | MongoDB (`uploads`); the driver's phone until sent | Personal data and evidence in disputes |
| Accounts and sessions | MongoDB (bcrypt password hashes); a JWT in the browser | Account takeover |
| Operational records: routes, delivery times, analytics | MongoDB | Business integrity (on-time figures, disputes) |

## 2. Who might attack it

- **Anyone on the internet**: can reach the homepage, sign-in, sign-up and the public tracking endpoint.
- **A customer**, or whoever holds their tracking link.
- **A driver**: signed in, and trusted only with their own routes.
- **A fleet manager**: trusted with the whole fleet, but not with administration.
- **Whoever finds a lost or shared driver phone.**
- **On a public demo**, every visitor, since the demo passwords are published.

## 3. Threats and how they are handled

| Threat (STRIDE) | Example | Mitigation | Residual risk |
|---|---|---|---|
| Spoofing | Guessing a password | bcrypt hashes; 20 attempts per 15 min per IP; the account locks after 5 failures | A slow, distributed guessing attack; use long passwords |
| Spoofing | Forging a session token | HS256 only (pinned when signing and verifying); `JWT_SECRET` required in production; tokens are revoked when the password changes | A stolen token stays valid until it expires (7 days; see 4) |
| Spoofing | A manager signing in as the demo admin | Demo endpoints exist only with `DEMO_MODE=true`, so the known accounts cannot be created through the API | None known |
| Tampering | Changing another driver's deliveries | Every route and stop endpoint checks that the driver owns the route; field whitelists stop mass assignment | None known |
| Tampering | Backdating a delivery from the offline app | The time is trusted only within 24 hours and never in the future; late updates also keep `receivedAt`, which the route page shows | A driver can shift a time by up to 24 h, visibly |
| Tampering | NoSQL injection, oversized or malformed input | express-mongo-sanitize; express-validator on every route; 100 kB body limit; regex-escaped search | None known |
| Repudiation | "I never delivered it" | Proof photo and/or signature with time and driver; admin changes and security events are logged | Logs live in the host's log stream only |
| Information disclosure | Reading other customers' stops from a tracking link | The token is 18 random bytes; the response holds only that customer's own delivery; the link expires 48 h after delivery; `robots.txt` keeps tracking pages out of search engines; the referrer policy keeps the token out of Referer headers | Anyone holding a live link sees the driver approaching |
| Information disclosure | Script injection stealing the session token | React escapes output; a strict Content Security Policy (scripts from the site only); no inline scripts | The token is in `localStorage` by design (see 4) |
| Information disclosure | A lost driver phone | Cached routes and the remembered driver are cleared on sign-out; unsent updates are dropped after 7 days | Data is readable on an unlocked phone that is still signed in |
| Information disclosure | Error details | No stack traces in production responses; error tracking sends no personal data | None known |
| Denial of service | Flooding the API | Global, sign-in, GPS, tracking and live-read rate limits; upload size and count limits | Limits are in memory, per server instance |
| Denial of service | Locking the demo accounts on a public demo | Demo accounts are never locked, and cannot be edited, deactivated or deleted in demo mode | None known |
| Elevation of privilege | A driver calling manager endpoints | Role checks on every route, covered by authorisation tests | None known |
| Elevation of privilege | Using the server as a free geocoding proxy | Address search and routing are for managers only | None known |
| Elevation of privilege | Framing the app to trick clicks | `frame-ancestors 'none'` and `X-Frame-Options: DENY` | None known |

## 4. Accepted risks

- **Session token in `localStorage`, valid for 7 days.** It is simpler than cookies across the Vercel and Render domains and suits drivers on shared phones. The Content Security Policy is the main defence. Changing a password revokes all of that user's tokens.
- **Rate limits held in memory.** That is correct for one instance on Render's free tier. With several instances, move them to a shared store such as Redis.
- **Demo passwords are public** on a demo deployment. That is the point of a demo; never load demo data into a database with real customers.
- **Free OpenStreetMap services** (map tiles, search, routing) have fair-use limits. For heavy use, self-host them or set `MAPBOX_TOKEN`.

## 5. Running it in production

**Secrets.** Set `JWT_SECRET` (`openssl rand -hex 32`) and `MONGODB_URI` in Render's environment, never in the repository. Changing `JWT_SECRET` signs everyone out, which is the quickest response to a suspected leak. Restrict MongoDB Atlas network access to Render's outbound addresses where possible.

**Email (optional).** Set `RESEND_API_KEY` and `EMAIL_FROM` on Render. Emails go to Resend for delivery, and contain names and addresses that managers can already see in the app. Demo accounts never get email.

**Proof retention.** Photos and signatures are deleted after `PROOF_RETENTION_DAYS` (default 90), which limits how much personal data is held and keeps the free database from filling up.

**Error tracking (optional).** Create a free Sentry project and set `SENTRY_DSN` on Render and `VITE_SENTRY_DSN` on Vercel. Without them, nothing is sent anywhere.

**Uptime.** Point a free monitor such as UptimeRobot at `https://<your-api>.onrender.com/api/health` every 5 minutes. It also keeps the free Render instance from sleeping during the day.

**Backups.** Atlas M0 has no backups of its own. The `Database backup` workflow (`.github/workflows/backup.yml`) dumps the database nightly at 02:00 IST and keeps 14 days of copies, encrypted with AES-256. To turn it on, add two repository secrets: `MONGODB_URI` and `BACKUP_PASSPHRASE` (a long random phrase kept outside GitHub). It can also be run by hand from the Actions tab.

To restore a backup, download the artifact from the workflow run, then:

```bash
gpg --decrypt hopr-<date>.archive.gpg > hopr.archive
mongorestore --uri "<target connection string>" --archive=hopr.archive --gzip --drop
```

`--drop` replaces the collections in the target database, so restore into a new database first if you only need to recover some records.

**If something goes wrong**
1. Change `JWT_SECRET` to sign everyone out, and change any exposed passwords or connection strings.
2. Check the Render logs for `SECURITY` and `ADMIN_MUTATION` lines, and Sentry if it is set up.
3. Restore from the last good backup if data was damaged.
4. Write down what happened and what changed.

## 6. Reporting a vulnerability

Report it privately through GitHub: the repository's **Security** tab, then **Report a vulnerability**. Please don't open a public issue for a security problem.
