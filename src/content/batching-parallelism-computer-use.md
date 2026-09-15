---
created: 2026-07-11
category: Computer use
description: How batching actions and parallel operations improve computer use, with lessons from building pi-computer-use and handling independent app state.
image: /images/computer-use-batching-hero.jpg
modified: 2026-07-11
---

# Batching & Parallelism in Computer Use

![](/images/computer-use-batching-hero.jpg)

The release of 5.6 Sol has been all over the airwaves for the past few days, but one massive improvement flew under the radar for most people: Codex Computer Use and its two key features, **batching** and **parallel operations**.

![OpenAI Developers announcing improvements to Computer Use](/images/computer-use-event-loop.jpg "OpenAI Developers announcing improvements to Computer Use")

But how exactly do these new techniques improve Computer Use (CU)?

Codex can't tell us the secret, but open source can! pi-computer-use added batched actions in April 23 with v0.1.4, and [@trycua](https://x.com/@trycua)'s cua driver has supported parallelism since June 1 with v0.5.0 - all before Codex did.

> I'm the creator of pi-computer-use, and recently joined the cua-driver team, so let me share the secret computer use sauce :^)

### The Event Loop in Computer Use

![A simplified computer use event loop](/images/computer-use-batched-actions.jpg "A simplified computer use event loop")

CU enables your agent to control apps on your computer, through a repeated three step process we'll call the **Computer Use Event Loop**:

- Observe (what the agent can see on your screen)
- Think (what should the agent do, based on what it knows)
- Interact (the action that agent takes on your app)

After every interaction, the agent has to observe the response from the app in question and tune its next response correctly. This made Step 2 the main bottleneck for CU: even if it was a simple action such as scrolling down the page, each scroll action required the agent to think once.

This had three main drawbacks: it was slow, expensive, and mean that the context of the model would fill up significantly faster for no benefit. So what if we could reserve the thinking for complex state changes and actions?

### Batched Actions

![Sequential vs batched actions in pi-computer-use](/images/computer-use-batching-latency.jpg "Sequential vs batched actions in pi-computer-use")

Batched actions offer a straightforward improvement to this problem: combine simple actions together in a single model pass. For pi-computer-use, this was largely inspired by Pi Coding Agent's multi-step edit tool.

![Pi Coding Agent's multi-step edit tool](/images/computer-use-parallel-operations.jpg "Pi Coding Agent's multi-step edit tool")

In pi-computer-use, not only were multi-step processes cheaper (like clicking the next button multiple times), it improved agent adaptation: if the agent had previously struggled with a task in the thread, it could re-complete the same task later at a significantly better latency and accuracy.

![Batching latency improvement](/images/computer-use-parallel-state.png "In both parallel and sequential implementations of pi-computer-use, batching showed a ~59% improvement in latency.")

In both parallel and sequential implementations of pi-computer-use, batching showed a ~59% improvement in latency.

> An extension would be replayable actions, similar to Codex's Record and Replay. I'm working on bringing that to pi-computer-use now!

Batching was a great first step, showing up to a 59.2% improvement in pi-computer-use. But there was still a key problem: it was sequential: if multiple agents need CU, they each have to wait their turn.

### Parallel Operations

This is where parallel operations come in. Instead of only allowing one agent to use CU tools at a time, each agent working in parallel only needs to worry about the app that it's currently modifying. Sounds simple enough, right?

The issue for pi-computer-use was that **state was part of the loop**: it had one implicit current UI state for the entire session, where one agent would have to wait for another to finish, even if they were using different apps.

![pi-computer-use's implementation of parallelism](/images/computer-use-parallel-workers.jpg "pi-computer-use's implementation of parallelism")

Our solution was to maintain an **immutable state store** outside of the shared loop: each agent acts against a versioned snapshot of an app it interacts with, where every app has its own queue. To prevent conflicts, the state store rejects agent actions that are based on an outdated snapshot.

> A testing branch for parallel workers in pi-computer-use improved latency by almost 5x!

There's still so much more to Computer Use - these are just two of many other optimisations possible for the next generation of frontier interfaces. If you'd like to see the magic for yourself, check it out here:

https://github.com/injaneity/pi-computer-use

https://github.com/trycua/cua
