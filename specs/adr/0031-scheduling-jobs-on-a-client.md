# ADR-0031 — Scheduling jobs on a client

Status: accepted · Date: 2026-08-28

`JobModel` has carried `schedule` and `nextRunTimestamp` since the job engine was written,
`JobTriggerType` has allowed `"scheduled"` for just as long, and nothing has ever read or
produced any of the three. `JobScheduler` fills that in — under the constraints a client
imposes, which are not the ones a cron daemon was designed for.

## Decision

A `JobScheduler`, mounted at `stack.jobScheduler` beside `jobEngine`, **not started by the
stack**. The application calls `start({ jobs: [...] })` and wires its own wake signals to
`tick()`.

Five properties of a client drive everything below:

1. The app is closed most of the time.
2. Timers are throttled in background tabs and frozen in suspended apps.
3. Several instances hold replicas of the same `~Job`.
4. A run can vanish mid-flight, with no process left to notice.
5. The clock belongs to the user.

## Missed occurrences collapse; they are never replayed

`nextOccurrence` returns *the next* due moment, computed forward from now. There is no API
for the occurrences in between, and that absence is the decision.

A device closed for a fortnight has missed fourteen occurrences of a daily job. Replaying
them runs a review campaign fourteen times over data that justifies running it once — each
pass believing it is the 9 a.m. of a different day. One sweep that reads current state
produces exactly the right set; fourteen produce the same set plus a stampede. The rule
underneath: *the absence of a tick is not an event, and must not be recorded as one.*

## The grammar is not cron

| Form | Meaning |
| :--- | :--- |
| `@every 30m`, `@every 6h`, `@every 7d` | Interval since the last run |
| `@hourly`, `@daily`, `@weekly` | Anchored to the local hour / midnight / Monday |
| `@daily@09:00`, `@weekly@18:30` | Anchored to a local wall-clock time |

Cron is refused by the parser rather than partially supported. Its whole vocabulary names
occurrences — "02:15 on the 3rd" — and a client cannot promise to be running at one.
Accepting the syntax would promise a precision the runtime has no way to keep, and the
failure would be silent: the job simply never runs on the 3rd. `@every`/`@daily` say what a
client can honour, which is a floor: *not more often than this.*

Anchored forms are computed through local `Date`, so `@daily@09:00` stays 09:00 to the
person reading the screen across a daylight-saving change — the only definition of "nine"
a campaign cares about.

## Schedule state is device-local, not `JobModel.nextRunTimestamp`

State lives in `_local/docstack-job-schedule`, which PouchDB never replicates.

`nextRunTimestamp` looks like the place for it and is not. `~Job` is in
`DATA_MODEL_CLASSES`, so an application's own job documents replicate even under an
`include` allow-list — only DocStack's seeded ones (`Job-Auth-Classic`) stay local, and
they stay local by id (ADR-0024). Every device would therefore write that field on every
run and collide **on a document whose `content` field is executable code**. A losing
revision there does not lose a timestamp — it forks what the job does. The answer is not
shared between devices anyway; "has *this* device run the sweep" is per-device state,
exactly as `~JobRun` already is.

`JobModel.nextRunTimestamp` is therefore left for a server worker to use, or to be dropped.

## Duplicate work is answered by the jobs, not by a lock

Two devices will both reach the same due moment. Leader election needs a consensus point
that two offline replicas do not have, so the scheduler does not attempt one.

Instead, **jobs that run here must write documents whose `_id` is derived from what they
are about** — `ReviewRequest-<orderId>`, not a fresh UUID. A second device's sweep then
collides into one document rather than sending a second email; two offline devices produce
one document with a conflict, which is still one review request. The scheduler cannot
enforce this and does not pretend to: it is the price of running campaign logic on clients,
and it is stated in the module docblock where a job author will meet it.

## Only named jobs run unattended

`start({ jobs })` is an allow-list with no "all" option, and `pinnedHashes` optionally pins
each job's `hash`.

`~Job.content` is JavaScript, it always replicates, and `Job.hydrate` runs it through
`new Function` — which executes with full ambient authority whatever the prose around it
says. Until now a human was behind every execution. Without an allow-list, unattended
execution would turn "a peer can write a document" into "a peer can run code on every
device", and no class filter could stop it.

The stored `hash` does not help on its own: it sits beside the content it certifies, so
whoever writes one writes the other. It detects corruption, not authorship. Pinning the
expected value *in application code* is what gives it meaning.

## Claim before dispatch, and reap what never came back

`nextRunAt` is advanced **before** the job runs. A tab closed mid-run then costs the job one
period, rather than re-running it on every boot from then on; jobs here are required to be
idempotent anyway, so a lost run is the cheaper of the two failures.

Every tick first sweeps `~JobRun` documents left `RUNNING` past a ceiling (15 minutes by
default) into `CANCELED`. Status only moves inside `Job.execute`'s `try`/`catch`, so a
closed tab leaves one `RUNNING` for ever — and `hasRunningInstance` then skips that
singleton job on that device permanently. Latent while jobs only ran by hand; a job that
silently stops working once they do not. `~JobRun` never replicates, so these are
unambiguously this device's abandoned runs.

Failures back off exponentially (5 minutes, doubling, capped at 6 hours), because a job
that throws on a malformed document would otherwise become a `~JobRun` written into the
user's database every minute.

## Rejected

- **Cron syntax.** Names occurrences a client cannot promise to attend.
- **Replaying missed occurrences.** Turns a fortnight offline into a fortnight of runs.
- **A lock document or leader election.** No consensus point across an offline partition.
- **A queue of per-entity scheduled documents.** It replicates, conflicts, needs its own
  collection, and drifts from the data it describes — an entry for an order since refunded.
  Polling a bounded window derives the same set from the truth every time.
- **Starting the scheduler from the stack.** Which replicated code may run unattended is
  not a decision a library can make for an application.
