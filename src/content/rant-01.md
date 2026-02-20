# Eytzinger Layout

> Credit to [@onebignick](https://www.nicholasong.fyi/) for showing me this

[Eytzinger Layout](https://algorithmica.org/en/eytzinger) optimises the memory access pattern of binary search by storing sorted data in the level-order array layout of an implicit (near-complete) binary search tree, instead of a flat sorted array. This means top tree levels are packed tightly in memory:

![Visualisation of Eytzinger's Layout](/images/eytzinger.png)

Recall that a complete binary tree is stored in an array where the children of the node at index `k` are located at indices `2k + 1` and `2k + 2`. Since the next midpoint is always a child node of the current midpoint, there is significant spatial locality at higher levels of the tree that we can take advantage of.

In the first few iterations, we often hit the same L1 CPU cache line (or nearby ones) after retrieving the root. In contrast, a standard sorted-array binary search makes large jumps (such as `N/2` to `N/4`) early, which can lead to more cache misses on large arrays.

There is a caveat: this is most useful for **write-once, read-many** workloads. In write-heavy cases, insertion is still expensive `O(N)` (as with flat sorted arrays), so dynamic tree/B-tree style structures are often a better fit.
