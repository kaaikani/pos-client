# How to give Claude a requirement

Fill this in and say **"read MY_REQUEST.md"**. Nothing else is needed.

Anything left blank, Claude must ask about — it must not guess.

---

## 1. Which screen

> Sales / Purchase / Print Design / Settings / new screen …
> One screen at a time. Two screens in one request is how things get mixed up.

## 2. What should happen

> Plain sentences. "Delivery Challan-ai settings-la on panna, menu-la varanum."
> Not "make it like Vyapar" — say the behaviour you want, not the app you saw.

## 3. What must NOT change

> "Sales page-la onnum thodakoodadhu."
> This is the most important line. Without it Claude decides for itself.

## 4. Backend or frontend

> - `BACKEND ONLY` — server, database, API. No screen work.
> - `UI ALSO` — screen too.
> - `EXPLAIN ONLY` — do not touch code, just tell me the plan.

## 5. Screenshot (optional)

> If you attach one, say **why**:
> - `REFERENCE` — idea mattum, copy pannaadha
> - `COPY THIS LAYOUT` — ipdiye venum
> - `THIS IS A BUG` — enna nadakkudhu-nu paaru

---

## Example — a good request

```
SCREEN:       Print Design
WHAT:         Vyapar maadhiri oru checkbox list venum — Company Name, Logo,
              GSTIN, HSN, MRP, CGST, SGST, Amount in Words. Tick panna
              print-la varanum, untick panna varakoodadhu.
              Pakkathula live preview.
DON'T TOUCH:  Drag-and-drop canvas-ai eduthudaadha. Rendum venum.
MODE:         UI ALSO
SCREENSHOT:   COPY THIS LAYOUT
```

## Example — a bad request

```
Print design nalla illa, Vyapar paaru
```

Why it is bad: which screen? what exactly is wrong? what must stay? code
touch pannalaama? Claude ippo guess pannum, and guess thappa irukkum.

---

## Two short rules

1. **One process at a time.** Finish it, verify it, then the next one.
2. **"Recheck"-nu sonna, Claude code-ai paathu badhil solla vendum** — nyabagathula
   irundhu illa. Adhu neenga eppovum kekkalaam.
