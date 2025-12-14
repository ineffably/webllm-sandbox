```
I have a application that allows models to play Zork 1. I'm having a hard time with the prompts. keeping the models interested and not repeating commands or alternating between two commands. I added a reasoning guide that will reason the text back to the adventurer, but, that's only kinda helping. what is the best approach to trying to coax an LLM to play a text adventure?
```

You’re fighting three classic failure modes in text adventures with LLMs:

1. **No durable “world state”** (so it loops)
2. **No exploration policy** (so it toggles between 2 actions)
3. **No action validation** (so it repeats invalid/low-value commands)

The best approach is to stop trying to “prompt harder” and instead give the model a **small agent scaffold**: structured memory + an exploration policy + a loop breaker + constrained action selection.

Here’s a blueprint that works well for Zork-style parsers.

---

## 1) Split the agent into 3 roles (even if it’s one model)

**(A) Observer / State extractor (no actions)**
Input: last game output
Output (JSON): room name, exits, visible objects, NPCs, inventory delta, score/moves if present, notable clues (“there is a locked door”), hazards

**(B) Planner (high-level intent only)**
Input: extracted state + short memory
Output: goal for the next 3–8 turns (explore, map, obtain light, open passage, etc.) + 2–3 hypotheses

**(C) Actor (single command)**
Input: state + plan + constraints + “recent actions”
Output: **exactly one** parser command

Why it helps: the model stops hallucinating progress and you get a stable state representation you can use for loop detection and gating.

---

## 2) Give it real “memory” (not prose)

Use two memories:

### Short-term (rolling window)

* last room(s)
* last 10 commands + result classification (progress / no-change / failure)
* current plan (1 sentence)
* “stuck counter”

### Long-term (graph/map)

* rooms discovered: `room_id -> exits -> destination?`
* objects seen and where
* locked doors, puzzles, hazards, one-way passages
* “unresolved leads” list (things to return to)

LLMs loop because *they can’t tell what changed*. Your extractor makes deltas explicit.

---

## 3) Add an exploration policy so it doesn’t ping-pong

Give the actor a deterministic preference order:

1. If there’s an **unresolved lead** in this room, try it (e.g., locked door, closed container, suspicious description).
2. Else, if there are **new objects**, do: `examine X` / `take X` (with rules).
3. Else, move through an **untried exit** in this room.
4. Else, backtrack to the nearest room with untried exits.

This single policy kills most “north/south/north/south” oscillation.

---

## 4) Add loop breakers (mechanical, not “be creative”)

Track `(room_id, inventory_hash, key_flags)` plus last N commands.

If any of these triggers, force a different action class:

* **Exact same command 2x** in last 6 turns → forbid it for 10 turns.
* **Alternation A/B/A/B** detected → forbid both A and B for 6 turns.
* **3 consecutive no-change turns** → switch to *information gathering* mode:

  * `look`
  * `inventory`
  * `examine <each visible noun>`
  * `search` / `open` / `read` / `listen` depending on room text
* **5+ no-change turns** → switch to *backtrack to nearest unresolved lead*.

This is way more effective than “don’t repeat yourself” instructions.

---

## 5) Constrain actions with a “candidate list”

Instead of free-form action generation, you can generate a small menu:

**Candidates = verbs × nouns from extractor**

* Verbs: `look, examine, take, drop, open, close, read, turn on, turn off, inventory, save` (if supported), movement exits
* Nouns: visible objects + inventory items + obvious room features

Then have the actor choose **one** from the list. This reduces parser thrash and nonsense commands.

Even better: classify each candidate with a simple heuristic score:

* +3 if it targets an unresolved lead
* +2 if it’s a new noun not examined
* +2 if it’s an untried exit
* -5 if it’s forbidden by loop breaker
* -2 if same verb used 3 turns in a row

---

## 6) Teach “Zork literacy” explicitly (tiny but important)

Models often don’t know the parser idioms that matter:

* Always `take all` is risky; prefer selective takes.
* Prioritize **light** early: lantern, matches, “turn on lamp” patterns.
* `open <container>` then `examine` then `take`.
* Use `inventory` often.
* If a command fails, try synonyms: `get/take`, `x/examine`, `i/inventory`.
* If movement blocked, probe: `open door`, `unlock door with key`, `enter`, `climb`, `push`, `pull`.

Put these as *rules the Actor follows*, not a big narrative guide.

---

## 7) Prompt shape that tends to work (copy/paste template)

### System (or top-level instruction)

* “You are playing Zork I. Output exactly ONE command per turn.”
* “Never repeat a command that produced no change in the last 6 turns.”
* “Follow the exploration policy and loop-break rules.”

### Developer / tool message (your app)

Provide structured inputs:

```text
GAME_OUTPUT:
<raw text>

STATE_JSON:
{...extracted...}

MEMORY_SHORT:
- current_plan: ...
- last_commands: [...]
- stuck_count: ...
- forbidden_commands: [...]

MEMORY_LONG (compressed):
- map: ...
- unresolved_leads: ...
- objects_of_interest: ...
```

### Actor instruction

```text
Choose the best next command.
Constraints:
- Output a single Zork command, nothing else.
- Must not be in forbidden_commands.
- Prefer: unresolved leads > new nouns to examine/take > untried exits > backtrack.
```

---

## 8) If you only change one thing

Add **mechanical loop detection + forbidden command list** + **untried exits policy**.
That alone usually stops the “alternating between two commands” problem.

