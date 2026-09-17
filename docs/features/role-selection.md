# Role Selection

**Issues:** [#76](https://github.com/SkyeRangerDelta/LCARS47/issues/76) (role selector enhancements),
[#63](https://github.com/SkyeRangerDelta/LCARS47/issues/63) (suggestions and enhancements)

`/role join` and `/role leave` took a native Discord role option. That picker renders **every**
role in the guild — Admiral, Officer, bot roles, the lot — and Discord provides no server-side
filter for it. There was no validation that could fix that: you can reject a choice after the
fact, but you cannot stop the dropdown offering it.

So the native picker had to go. Everything member-facing now builds its options from a curated
allowlist instead.

---

## The two halves

**The allowlist** decides what *should* be self-assignable. Flag officers curate it.

**The safety floor** decides what *can* be, and cannot be configured away. It runs on every
read and every write.

That split is the whole security model. A curation mistake costs you a role that doesn't
appear in the picker — never a role that hands out permissions it shouldn't.

### The safety floor

A role is rejected outright when it:

| Check | Why |
|---|---|
| shares the guild id | that's `@everyone`, which cannot be assigned at all |
| is `managed` | bot, booster and integration roles; Discord refuses these regardless |
| sits at or above LCARS' highest role | Discord requires *strictly* below — offering it guarantees a Missing Permissions error |
| carries a privileged permission | it's an administrative role wearing a game role's clothes |

The privileged list errs wide on purpose: Administrator, ManageGuild, ManageRoles,
ManageChannels, ManageWebhooks, ManageMessages, ManageThreads, ManageNicknames,
ManageEmojisAndStickers, ManageEvents, ManageGuildExpressions, Kick, Ban, ModerateMembers,
Mute, Deafen, MoveMembers, MentionEveryone, ViewAuditLog.

A game role wrongly excluded is an annoyance a flag officer diagnoses in seconds with
`/role list`. A moderation role wrongly offered to the whole server is a much worse afternoon.

### The record

```js
{
  roleId:  "432294689044037637",  // string, always - see below
  name:    "Belt Repairman",      // display fallback for a deleted role
  game:    "Factorio",            // optional; the picker's subtitle
  addedBy: "107203929447616512",
  addedAt: ISODate("...")
}
```

Only `roleId` is load-bearing. It **must** be stored as a string: a snowflake exceeds 2^53, so
as a BSON Double `732752652202410015` lands as `732752652202410000`, the role lookup misses, and
the entry reports as *the role no longer exists* — pointing you at Discord instead of at the
type. Worth knowing if you ever seed entries straight from Compass.

`game` is optional in the schema so entries predating the field keep working, but required on
`/role add` so nothing new arrives unlabelled.

### The allowlist is the authority; the menu is only a cache

A rendered menu is a snapshot. Between rendering and submitting, the allowlist can change, a
role can be deleted, or a role can be granted ManageGuild.

So `handleSelect` never trusts what the menu said. It re-reads the allowlist, recomputes
eligibility from scratch, and diffs against *that*. A role that went bad while the menu sat
open simply isn't in the fresh result and cannot be applied.

---

## Commands

| Command | Who | What |
|---|---|---|
| `/role select` | everyone | The picker |
| `/role create <name> <game> [colour] [mentionable]` | flag officers | Create a role and list it in one step |
| `/role add <role> <game>` | flag officers | Open an existing role up, or relabel one |
| `/role remove <role>` | flag officers | Close a role off |
| `/role list` | flag officers | Review the list, including stale entries |

`/role add` keeps a native role option, which is correct there — an officer picking from the
full guild list is exactly the intended behaviour. It applies the safety floor before storing
and explains the specific rejection.

It also takes a **game**, which is what the picker shows under the role name. Half the roles
on PlDyn don't announce what they're for — "Belt Repairman" is Factorio, and nobody who wasn't
there when it was named would guess. The option is required, so new entries can't quietly skip
the one piece of context that makes the list readable.

`name` and `game` are refreshed on *every* `/role add`, not just on insert. So re-running the
command on a role that's already listed is how you correct a label — the alternative would be
removing the entry and adding it back, and removal is the one operation with a side effect
worth avoiding. The reply distinguishes *added* from *relabelled* from *nothing changed*, so a
typo fix visibly takes effect.

### `/role create`

Creating a role in Discord and listing it here were always done together, and doing them apart
is where mistakes creep in — a role made by hand and never listed just quietly fails to appear
in anyone's picker. This does both.

Three details that matter:

**Permissions are set explicitly to none.** Omitting `permissions` on `roles.create` copies
@everyone's permissions onto the new role. If @everyone happens to hold something on the
privileged list, the command would create a role the safety floor then refuses to list. A game
role is a tag; it needs nothing.

**Duplicate names are refused.** Discord permits two roles with the same name, which would put
two indistinguishable entries in the picker. The command checks case-insensitively and points
at `/role add` instead, which is usually what was meant.

**New roles land just above @everyone**, so they're always below LCARS and clear the hierarchy
check without any repositioning. The floor still runs afterwards as a backstop — if it somehow
fails, the role is left off the list and the reply says so rather than listing something that
will never render.

`colour` takes `#rrggbb`, `rrggbb`, or the three-digit shorthand, and rejects anything else
rather than silently producing a black role. `mentionable` defaults to off.

Failures are reported in terms an officer can act on: a missing Manage Roles permission and
Discord's 250-role ceiling are named specifically rather than surfacing a raw API error.

`/role remove` un-lists the role. **Members already holding it keep it.** Un-listing means
"nobody new may take this", not "revoke it from everyone" — a mass role strip is not something
a single slash command should be able to do by accident.

`/role list` exists because a stale entry *vanishes* from the picker. Without somewhere to see
"Star Citizen — the role no longer exists", a flag officer has no way to notice it broke.

### Who counts as a flag officer

`hasFlagAuthority` in `Src/Subsystems/Utilities/AuthUtils.ts`, matching **Fleet Admiral** and
**Admiral** by name. Same shape and same failure mode as the existing `hasBridgeAuthority`:
admins always pass, and a guild with no flag role at all fails **closed** to admins only. This
gate decides who can widen the self-assignable list, so a gate that silently opens because
someone renamed a role would be worse than no gate.

---

## The picker

```
/role select
┌─ Role Selection ────────────────┐
│ Select your game roles — 25     │
│ available. Roles you already    │
│ hold are ticked.                │
│ ┌─────────────────────────────┐ │
│ │ ✓ Belt Repairman            │ │
│ │     Factorio                │ │
│ │   Ark Survivor              │ │
│ │     ARK: Survival Evolved   │ │
│ │ ✓ Star Citizen              │ │
│ │     Star Citizen            │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

The smaller second line is the stored game, rendered by Discord as the option's description.
Entries with no game on record — the two that predate the field — simply have no subtitle
rather than an empty one.

**Ephemeral is load-bearing, not just tidiness.** The response is per-viewer, which is the only
reason the menu can open with the invoker's current roles already ticked. A shared, persistent
board is identical for everyone and cannot show per-member state — that was the deciding factor
against building one.

`minValues` is 0, so deselecting everything is a valid submission meaning "remove them all".

After each submission the message re-renders from a force-fetched member, so the ticks match
what the member now actually holds rather than what they held when the menu opened.

### Paging, and why it's live today

Discord caps a select menu at **25 options** and a message at **5 action rows**. So one
`/role select` response carries at most **125** roles.

PlDyn sits at exactly **25 game roles**, which is the boundary — the 26th role added splits the
picker into two menus. The paging path is therefore live from day one rather than dormant, and
there are tests pinning both the 25 and 26 cases.

> **The page-scoped diff.** Each menu submits independently, and a submission only reports the
> values from *its own* menu. So the diff is scoped strictly to that page's roles. Diffing
> against the whole allowlist would strip every role the member holds from every *other* menu
> in the message, since those ids were never in the submission.

One accepted race: if the allowlist changes while a menu sits open, the recomputed page may not
hold quite what was rendered. The window is seconds wide and needs an officer editing the list
at that exact moment; recovery is re-running `/role select`. Encoding the rendered ids in the
customId would close it, but 25 snowflakes do not fit in a 100-character customId.

Past 125 roles the extras are dropped with a warning. Going further needs pagination buttons —
a bridge to cross at 126.

---

## Plumbing

`interactionCreate` previously routed buttons and chat input only, so select menus needed a new
branch and `handleSelect?` on the `Command` interface, mirroring the existing `handleButton`.

Routing itself is unchanged: `customId.split( '_' )[0]` against `CMD_INDEX`, which
`OPs_CmdHandler` keys on `data.name`. `role_select_0` therefore routes to `role` with no
special casing.

---

## Files

| Path | Role |
|---|---|
| `Src/Subsystems/Auxiliary/Interfaces/RoleInterfaces.ts` | `SelfRoleRecord`, `ResolvedSelfRole`, `EligibleSelfRole`, `RoleIneligibility`, `SelfRoleAddResult` |
| `Src/Subsystems/Roles/Roles_Utilities.ts` | Allowlist storage, safety floor, resolution, paging |
| `Src/Subsystems/Utilities/AuthUtils.ts` | `hasFlagAuthority`, `FLAG_ROLE_NAMES` |
| `Src/Commands/Active/role.ts` | The four subcommands, menu building, submit handling |
| `Src/Events/interactionCreate.ts` | Select menu routing |
| `Src/Subsystems/Auxiliary/Interfaces/CommandInterface.ts` | `handleSelect?` |
