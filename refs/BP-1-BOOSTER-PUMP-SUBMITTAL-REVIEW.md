# BP-1 Domestic Booster Pump — substitution review

**Reviewed:** Grundfos CMBE TWIN 10-54, product no. **99503875** (SupplyHouse listing)
**Against:** Plumbing plan schedule *DOMESTIC BOOSTER PUMP SCHEDULE*, mark **BP-1**
(basis of design Armstrong PM280302-5)
**Date:** 2026-08-13
**Verdict: ❌ REJECT — does not meet the scheduled duty. Not close.**

The specific question asked was whether this pump covers **80 % of the 200 GPM**
scheduled flow (= 160 GPM). It does not. At the scheduled 61 psi boost it delivers
roughly **50 GPM — about 25 % of design flow**, and it cannot pass 160 GPM at *any*
pressure because 160 GPM is past the end of its published curve.

---

## 1. What the plans require

From the pressure analysis and pump schedule on the plumbing sheet:

| Line | Value |
|---|---|
| Total water flow | 945 wsfu → **197.6 GPM** |
| BP-1 flow | **2 × 100 GPM** (200 GPM total) |
| BP-1 discharge boost | **61 psi** |
| BP-1 motor | **10 HP** |
| BP-1 electrical | **208 V / 3 ph / 60 Hz**, 3600 rpm |
| BP-1 header | **3 in** |
| BP-1 weight | ±567 lb |

The 61 psi boost is internally consistent and checks out:

```
Supply 40 psi − meter 5 − RPZA 10 − 3" pipe 5            = 20 psi remaining
Required: fixture 20 + elevation 26 (60 ft × 0.433) 
        + softener 25 + horizontal run 10               = 81 psi
Boost required: 81 − 20                                 = 61 psi   ✓
```

Power sanity check on the schedule itself:
`BHP = (200 GPM × 141 ft) / (3960 × 0.65) ≈ 11 HP` → the scheduled **10 HP is correct**.

---

## 2. What the Grundfos unit actually is

Source: *Grundfos Data Booklet, CMBE / CMBE TWIN* (type key p.6, electrical data p.15,
dimensional p.11, product numbers p.19, curves p.13).

The Grundfos type key is explicit about what the model number means:

- **`10`** = rated flow rate at 60 Hz in **m³/h** → 10 m³/h = **44 GPM per pump**
- **`54`** = **maximum head in metres** → 54 m = **177 ft = 76.8 psi, at zero flow**

TWIN = two CMBE pumps in parallel under cascade control. Parallel operation doubles
flow, **not head** — so the twin is 88 GPM nominal against the same 177 ft shutoff
ceiling. The published 2-pump curve envelope runs 0 → **120 GPM** end-of-curve.

| | Plan BP-1 | Grundfos 99503875 |
|---|---|---|
| Flow | 200 GPM (2 × 100) | 88 GPM nominal, ~120 GPM end-of-curve |
| Boost | 61 psi **at 200 GPM** | 77 psi **at 0 GPM**; ~35 psi at its own 88 GPM |
| Motor | 10 HP | ~4 HP total (2 × 2 HP frames; P1 = 2 × 1250 W = 2.5 kW) |
| Electrical | 208 V / **3 ph** / 60 Hz | 1 × 220–240 V, **single phase**, 2 × 9.1 A |
| Header / connections | 3 in | **2 in NPT** |
| Weight | ±567 lb | 180 lb |
| Drawdown tank | 20 L **ASME**, remote mounted | 4 L diaphragm, non-ASME, on-skid |
| BMS | **BACnet MS/TP** | Grundfos GO radio; no native BACnet MS/TP |
| Controls | NEMA 1, single-point conn. w/ main disconnect | 15 ft cable to fuse box; no panel or disconnect |
| Instrumentation | suction + discharge pressure transmitters, discharge temp sensor | one discharge pressure sensor |
| Safeties | low suction shutdown (AE), light arrestor | dry-run protection only |

---

## 3. The duty-point math

**Required duty point: 160 GPM @ 61 psi (141 ft).**

At 141 ft the unit is already at 80 % of its *shutoff* head (141 / 177 = 0.797).
Approximating the published curve as `H = H₀[1 − (Q/Qmax)²]`, H₀ = 177 ft, Qmax = 120 GPM:

```
141 = 177 [1 − (Q/120)²]  →  (Q/120)² = 0.203  →  Q ≈ 54 GPM
```

Independent check from the motor data (P1 = 1250 W/pump, ~85 % motor+drive, ~58 % pump):

```
Hydraulic power ≈ 616 W/pump
Q = P / (ρgH) = 616 / (1000 × 9.81 × 43 m) = 5.25 m³/h = 23 GPM/pump
→ 46 GPM for the twin
```

Both methods land in the **45–55 GPM** band. Even granting an unrealistically generous
4 HP of shaft power at 65 % efficiency, the ceiling is `(4 × 3960 × 0.65) / 141 ≈ 73 GPM`.

**So at 61 psi: ~50 GPM, and under no assumption better than ~73 GPM.
That is 25–37 % of design flow — not 80 %.**

Run it the other direction and it fails just as hard:

- **At 160 GPM** → past the 120 GPM end-of-curve. Zero boost. The pump physically
  cannot pass this flow.
- **At its own 88 GPM nominal** → `177 [1 − (88/120)²] = 82 ft = 35 psi`. Still 26 psi
  short of the required boost. (This is the "82 ft max head" figure some resellers
  publish.)
- **Delete the softener allowance entirely** (boost drops to 36 psi / 83 ft, an
  indefensible assumption but worth testing) → `120 √(1 − 83/177) ≈ 87 GPM`, still
  44 % of design flow.

There is no operating assumption under which this unit reaches 160 GPM at usable pressure.

---

## 4. Independent disqualifiers

Even setting hydraulics aside, any one of these is its own rejection:

1. **Single phase.** Unit is 1 × 220–240 V. Schedule calls for 208 V/3 ph/60 Hz. The
   pump room feeder and disconnect would be the wrong service.
2. **2 in connections vs 3 in header.** 200 GPM through 2 in Sch 40 (ID 2.067 in) is
   **19 ft/s** — roughly quadruple the 5 ft/s the sheet's own notes size to. Even at
   88 GPM it is 8.4 ft/s.
3. **No BACnet MS/TP.** Schedule requires it; CMBE TWIN has no CIM/gateway path.
4. **No NEMA 1 control panel, single-point connection, or main disconnect.** The unit
   ships with a 15 ft cable for fuse-box connection.
5. **4 L on-skid diaphragm tank** where a 20 L ASME remote-mounted drawdown tank is
   specified.
6. **Application class.** Grundfos rates the CMBE 10 family for single/two-family homes,
   apartments, and "small hotels/guest houses." This is a 115-key hotel at 945 wsfu —
   an order of magnitude outside the product's intended range.

---

## 5. If a Grundfos package is wanted

The right Grundfos family for this duty is **Hydro MPC-E (BoosterpaQ)** with CRE pumps —
it is the direct analogue to the scheduled Armstrong PM280302-5:

- multiple CRE integrated-VFD pumps in parallel, sized to 200 GPM @ 61 psi
- 3-phase power
- CU 352 controller with CIM card — **BACnet MS/TP is standard**
- pre-piped, pre-wired, pre-tested skid with suction/discharge headers

Have the supplier run a Grundfos selection at **200 GPM / 61 psi boost / 208 V-3 ph** and
return a curve with the duty point plotted on it. Do not accept a catalog "max flow" or
"max head" number — those two figures occur at opposite ends of the curve and never
at the same time, which is exactly the error that makes the CMBE TWIN look plausible here.

---

## Sources

- Grundfos Data Booklet, *CMBE, CMBE TWIN* — type key, electrical data, dimensional
  data, performance curves, product numbers
- Grundfos product selection: [CMBE TWIN 10-54 — 99503875](https://product-selection.grundfos.com/us/products/cmb-cmbe/cmbe-twin/cmbe-twin-10-54-99503875)
- [Grundfos Hydro MPC-E](https://product-selection.grundfos.com/us/products/hydro-mpc/hydro-mpc-e) (correct family for this duty)
- Plumbing plan: water pressure analysis + domestic booster pump schedule, mark BP-1
