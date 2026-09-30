# Parked for the MEP pass (not FF&E — do not attach to GR- tags)

Drive folder **"Bathroom Vanity & Kitchenette Sink & Facuet - PD & Cutsheets"**
(`1aMbp9wMm9Llhvnjpyb0TN9bAYu2CyK9f`, inside Submittals) holds four plumbing
cutsheets. The folder name contains "Bathroom Vanity", which is what caused the
refs pipeline to mis-attach the faucet to **GR-302 Vanity @ Guest Bath** — a
casegood. Verified 2026-08-09 and removed. When MEP lines are appended
(`--merge-missing`), these belong to plumbing fixture tags, not FF&E:

| File | Drive ID | What it actually is |
|---|---|---|
| Moen Bathroom Vanity Faucet.pdf | `1cJVzmAEPWJPpKAN9Gm9GemcC1ktzPhdE` | M·Dura single-handle **lavatory faucet**, 9417F12 / 9419F12, 1.2 gpm, ADA lever |
| American Standard Bathroom Vanity Sink.pdf | `14O35Dqt2gqUH5QPf51dPY_p5YqmNMf4e` | Bathroom **lavatory sink** |
| Moen Kitchenette Faucet.pdf | `12hxybuB0ibfs__1X5RgmrwVvyXAV90Db` | Kitchenette **faucet** |
| American Standard Kitchenette Sink.pdf | `17ckGAqG7vHvhjZmr2Xu9OXuZthF-fgVc` | Kitchenette **sink** |

**Rule for the pipeline:** match submittals on *file content / model number*, never
on the enclosing folder's name. A folder can group by room area (vanity, kitchenette)
while its contents are a different trade entirely.

## Submittal audit — 2026-08-09 (every ref verified against Drive)

| Item | Submittal | Verdict |
|---|---|---|
| 901 Refrigerator | Danby DFF101B1BSSDB spec | ✅ model matches the item label exactly |
| kn 11 Microwave | Danby DOM16A2SSDB spec | ✅ model matches exactly |
| GR-500 Art Above Sofa | Kalisher Art Imagery Submittal | ✅ document names "GR-500 - ART ABOVE SOFA" |
| GR-402 / GR-402.1 Divider | RK Hospitality Room Divider Spec | ✅ WingIts WRD structural rod + ceiling mounts (the divider hardware package) |
| GR-100/101/300/302/308/318/321/322 | RK Hospitality FF&E Shop Drawings | ✅ package-level casegood/upholstery shop drawings |
| ~~GR-302 Moen faucet~~ | ~~Moen Bathroom Vanity Faucet~~ | ❌ **REMOVED** — plumbing trim, see above |
