---
status: accepted
---

# A Link may redirect permanently

A Link used to answer only with a temporary redirect (302). The reason: a browser remembers a
permanent redirect (301, 308) and goes on sending people to the old Target after it has been
changed. Some Units still asked to choose, mostly for search engines. A permanent redirect passes
an address's standing on to its Target, and some sites expect it.

So each Link has a **Redirect Type**: 302 (the default), 307, 301 or 308. A person chooses it when
creating the Link, and the Unit's members may change it later. Every change is recorded with who
made it, as a change of Target is. An API Key may choose the type when it creates a Link and cannot
change it afterwards. The API keeps to its six things.

What the old rule protected still holds where we control it. **Every type is sent with
`Cache-Control: no-store`**, so a browser that follows the standard asks again at each opening,
reaches the current Target, and is counted. What we do not control is what a search engine or an
app does with "moved for good". It may index or remember the Target. The UI says so whenever a
permanent type is chosen, and the Unit decides.

After the password form the answer is always 303, whatever the type: a 307 or 308 there would have
the browser post the password on to the Target.

## Considered Options

- **Keep 302 only** - rejected. It was safe, but it left Units with a real need for a permanent
  redirect to look elsewhere, outside the history and the counts.
- **Permanent and cacheable, as 301 classically is** - rejected. Changing the Target after printing
  is what a Link is for, and a cached redirect breaks exactly that.
- **Letting an API Key change the type** - rejected for now. It would be a seventh thing the API
  does, and nothing asked for it.
