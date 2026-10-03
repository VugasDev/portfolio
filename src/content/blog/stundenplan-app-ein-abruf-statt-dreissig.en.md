---
title: One Fetch Instead of Thirty — How a Privacy Conversation Rebuilt My Timetable App
description: My app fetched the same class timetable separately for every user. Rebuilding it around one fetch per class taught me more about verification than about architecture.
date: 2026-09-13
tags:
  - flask
  - python
  - webuntis
  - datenschutz
  - pwa
  - homelab
draft: false
---

I'm currently attending three classes at two schools — vocational school and a technical
college in parallel. Three timetables in two different WebUntis instances, with different
start times. Checking three portals every morning to find out where I need to be next annoyed
me enough that I built a small Flask app that combines everything in one view.

It worked well for a while. Then I wanted to give it to classmates — and that's where it got
interesting.

## The problem that only appears with multiple users

The first version was built the obvious way: everyone stores their WebUntis credentials, and a
separate fetch runs for each account. Perfectly fine for me alone.

With thirty people from the same class, that's thirty fetches for a single piece of
information. The timetable is the same, after all. And the load doesn't land on me, but on the
school's WebUntis server.

As long as that was the case, any short fetch interval was out of the question. The job ran
once a day — which, when it comes to substitute lessons, is about as useful as yesterday's
weather forecast.

The second problem was more uncomfortable: the app stored other people's WebUntis passwords.
Encrypted, but they were there. One per person.

## The conversation that turned everything around

My plan was to ask the school for official class timetables. One read-only account, one fetch
per class, done.

The answer was no — and with a reason I hadn't had on my radar. Whoever has all class
timetables can trace for the **entire school** who is where and when. That's a movement
profile of teachers and students, and a school doesn't hand that to any individual. Rightly
so, if I'm honest.

What I found remarkable was what my teacher then suggested unprompted, without me bringing it
up: one person per class provides their account, and everyone else just proves that they
belong to that class. Exactly the model I had in the back of my mind as a fallback — except
that now it wasn't a workaround, but the route the school itself described as viable.

## The part I had to write down for myself

While writing up the concept, I realized that the school's argument doesn't disappear just
because the data now comes in through volunteers. **It shifts to me.** Every class timetable
contains teacher abbreviations and rooms. With several classes provided, I could reconstruct
individual teachers' daily schedules — and they haven't consented to anything. The student
providing access controls their own account, not third parties' data.

That led me to write a few things into the specification not as "nice to have", but as
requirements:

- **No history.** Anything outside the fetch window is deleted on every fetch. There's no
  archive of past weeks from which habits could be read.
- **No cross-class access.** Not even for me as the operator. There is no "all classes" view.
- **Revocation at any time**, and it deletes the credentials immediately — not at some point.
- **Information before input**, not in the fine print.

Looking back, that's the most valuable part of the whole project. Not the code.

## Measure first instead of guessing later

Before building the data model around this, I wanted to know one thing: is a normal student
account even allowed to fetch the class timetable, or only its own? Many WebUntis
installations only allow the latter. If that were the case, the provided timetable would be
the provider's personal timetable — wrong for everyone else when it comes to elective courses.

So I tried it with my own account before building anything. Result: the class timetable can be
fetched and is identical to my personal one — zero deviation in either direction. And the
attempt to fetch another class was rejected with `no right for timetable`. So the permission
is limited to your own class, which technically defuses the school's concern even further.

What I deliberately didn't test: whether other classes' timetables can be fetched at the other
school. That would mean accessing data I don't need and that the school explicitly doesn't
want to hand out. Not knowing whether it would work is the cleaner position here.

## The rebuild

`WebUntisAccount` — until then credentials, fetching and timetable in one — was split into two
things:

| Before | After |
| --- | --- |
| One account per person, with credentials | **Class source**: one row per class, with the credentials of the person providing it |
| Lessons attached to the account | **Membership**: who may read which class |

Plus the fetch rules: every 90 minutes between 6 a.m. and 10 p.m., manually at most every 15
minutes per class. Within that window, you get the stored state with its age shown instead of
an error message.

The systemd timer wakes up every half hour, but the application **decides**. That way the rule
lives in one place instead of twice in systemd and in the code — otherwise the two are
guaranteed to drift apart at some point.

## Three things green tests didn't find

I split the rebuild into ten steps, each with tests first, and had each step checked against
the requirements. At the end there was a review of the entire state. It found three things
that would otherwise have made it onto the server — even though all tests were green.

**1. Joining didn't check anything.**

The route that receives the class selection took school, class ID, username and password from
the form without checking them. The membership check ran one step earlier — and nothing tied
the two steps together. A direct POST was enough to join any class and store **made-up
credentials**. After that, the class counts as covered, real providers get rejected, and every
fetch produces a failing login.

All seven tests for this step were green. They only tested the regular path.

The bug, by the way, was already in my own implementation plan — I had specified the insecure
code there, and it was dutifully implemented that way. I fixed it with a signed, short-lived
token that carries the verified class list; the route now takes server and school exclusively
from it.

**2. The migration would have made the database unusable.**

`db.create_all()` creates missing tables. It leaves existing ones alone. Since a column was
renamed, every query would have failed with `no such column` after the deployment — for a
Flask app, that means: every page a 500, and the migration command couldn't have fixed it.

You never notice this locally, because test databases are created fresh.

The annoying part: two days later, I almost made the same mistake again with the next feature,
when a new column was added. This time I caught it while still on the branch. Since then
there's an idempotent command that adds missing columns via `ALTER TABLE`, and it's a fixed
step in the upgrade instructions.

**3. A plausible rule that wasn't true.**

For automatically retiring finished classes, I wanted to derive the duration from the class
name. The scheme is abbreviation + one digit for the year of enrollment + parallel class, e.g.
`AB42` for program AB, 2024, class 2. My assumption: three-letter abbreviations are technical
college classes with four years, two-letter ones vocational school classes with three.

It sounded logical. So I counted the real class lists before building it: at one school,
**28 of more than 160 classes don't follow the scheme at all** (names like "Counseling"). The
other one also uses **single-letter** abbreviations. And in the same three-letter group,
four-year technical college classes sit right next to abbreviations that obviously stand for
one- to two-year programs.

Under my rule, a short class would have been fetched needlessly for years — and worse: a
four-year technical college class with a short abbreviation would have been **retired a year
too early**. In the middle of the program.

Now it's a maintained list instead of a rule. An abbreviation without an entry is **never**
retired, and the interface shows when a duration is unknown.

## Not all errors are equally bad

Working on the same thing, I realized something I'm taking with me: the single year digit is
ambiguous — "4" can mean 2014 or 2024. With programs lasting three to four years, though, two
cohorts with the same digit are always ten years apart, so they practically never conflict.

Still, I had to decide which way to resolve it when in doubt. And the two errors are **not**
equally expensive:

- Retiring a running class too early takes the timetable away from its members in the middle
  of the school year.
- Continuing to fetch a long-finished class costs one unnecessary fetch.

So I resolve to the later year. The rule is a comment in the code, so that nobody "cleans it
up" someday.

## Finally: onto the phone

When I showed the app to classmates, the question about an app came immediately. I didn't want
to go into the app stores — developer fees for a school app aren't worth it to me.

So an installable web app: manifest, icons, service worker. Android offers "Install app", on
iOS it works via Share → "Add to Home Screen". Two details that easily go wrong:

- The manifest and the service worker must be at the **root**. From `/static/`, a service
  worker isn't even allowed to handle the application's pages.
- iOS doesn't evaluate the manifest and needs an `apple-touch-icon` separately — without
  transparency, otherwise it gets a black background.

For offline use, I separated two strategies: the interface comes from storage, but **pages come
from the network first** and only from the cache if that fails. An outdated timetable that
looks like a current one would be worse than none at all. I tested it by shutting down the
server and reloading — the timetable was fully there, and the current-time line kept moving,
because it's calculated in the browser.

On logout, the server sends `Clear-Site-Data`. Nothing should remain on a shared device — that
was my condition for putting the timetable on the device at all.

Dark mode was then almost a by-product. The effort wasn't in the toggle, but in the fact that
the lesson blocks had their own color variables that were only defined for light mode. Without
fixing those, the timetable would have glared bright white in the dark.

## Takeaways

I worked a lot with AI assistance on this project — writing code, cross-checking plans,
running reviews. The most useful thing about it wasn't the generated code, but the habit of
**measuring every assumption beforehand**: does WebUntis even allow this? What are the classes
really called? What happens to the existing database?

Three out of three assumptions that I considered obvious were wrong. And the one security hole
that almost made it onto the server came from my own plan — not from sloppy implementation.

Green tests mean that what I thought of was tested. Nothing more.
