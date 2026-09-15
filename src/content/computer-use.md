---
kind: page
description: Zane Chee's computer use projects and contributions, including pi-computer-use, cua-driver, demos, and technical writeups.
---

# Computer Use

This is a collection of my work related to computer use, separated into three sections: [pi-computer-use](https://github.com/injaneity/pi-computer-use) (my open-source computer use project), [cua](https://cua.ai) (a YC S25 computer use startup), and technical writeups on computer use.

***

I document the entire development process for pi-computer-use, along with my technical writeups on computer use, on [X](https://x.com/injaneity) and my [personal website](https://zanechee.dev). My focus is to **bring computer use to non-technical folks**.

### pi-computer-use

<video controls preload="metadata" poster="/images/pi-computer-use-launch.jpg" aria-label="Original pi-computer-use launch demo">
  <source src="/videos/pi-computer-use-launch.mp4" type="video/mp4">
  Your browser does not support embedded video. [Watch the original launch on X](https://x.com/injaneity/status/2046302876453232667?s=20).
</video>

An **open-source computer use extension** that I developed solo following the release of Codex Computer Use. Since launch, it has become the premier computer use extension for [Pi Coding Agent](https://pi.dev), reaching over 2,000 downloads per month at its peak. I actively maintain the extension, continually iterating on user feedback.

![pi-computer-use's download stats on pi.dev](/images/pi-computer-use.png)

I've maintained feature parity on macOS and Windows with Codex and other frontier computer use agents, shipping with the velocity of a full team while juggling work, school, and other hobbies.

- Batched Actions in [`v0.1.4`](https://x.com/injaneity/status/2047159449291575598?s=20)
- Chrome DevTools Protocol in [`v0.3.0`](https://x.com/injaneity/status/2065110712511500620?s=20)

### cua

![cua-driver landing page](/images/cua-driver.png)

I joined cua part-time to work on **cua-driver**, the largest open-source computer use client, with 19.6k GitHub stars. I worked on [embedded mode](https://github.com/trycua/cua/pull/2102), which allows cua-driver to inherit the parent app's permissions instead of requiring users to approve them again for cua-driver as a standalone app.

![hermes agent docs for computer use](/images/hermes-agent.png)

This was part of a larger partnership with OpenClaw (pending confirmation) and Hermes Agent (confirmed), through which cua-driver will integrate directly into users' setups without requiring manual permission approval.

I've also worked on Windows and Linux support for cua-driver, bringing both platforms up to par with the macOS implementation and ensuring consistent documentation across the repository. You can find a comprehensive list of my merged PRs [here](https://github.com/trycua/cua/pulls?q=is%3Apr+author%3Ainjaneity+is%3Aclosed).

### Technical Writeups

<video controls preload="metadata" poster="/images/pi-computer-use-v0.4.3.jpg" aria-label="pi-computer-use version 0.4.3 demo">
  <source src="/videos/pi-computer-use-v0.4.3.mp4" type="video/mp4">
  Your browser does not support embedded video. [Watch the v0.4.3 release on X](https://x.com/injaneity/status/2076345669946908849?s=20).
</video>

I've refined my writing style to be friendly to newcomers while preserving the technical depth that other computer use enthusiasts value. I focus on explaining how things work, how design decisions are made, and how to get started.

> 1. [Batching & Parallelism in Computer Use](/batching-parallelism-computer-use)
> 2. [Wait, what *exactly* is Computer Use?](/what-exactly-is-computer-use)
> 3. [The Internals of Computer Use](https://x.com/injaneity/status/2051730711712063994)
