# Eytzinger Layout

> Credit to [@onebignick](https://www.nicholasong.fyi/) for showing me this

[Eytzinger Layout](https://algorithmica.org/en/eytzinger) optimises the memory access pattern of binary search by storing the sorted data in a **balanced binary tree**, instead of a flat array. This allows for access of the next midpoint in a breadth-first search order:

![Visualisation of Eytzinger's Layout](/images/eytzinger.png)

Recall that a complete binary tree is stored in an array where the children of the node at index `k` are located at indices `2k + 1` and `2k + 2`. Since the next midpoint is always a child node of the current midpoint, there is significant spatial locality at higher levels of the tree that we can take advantage of.

In the first few iterations, we often hit the same L1 CPU cache line (that was pulled) when the root node was retrieved. In contrast, a standard sorted array binary search makes massive jumps (such as `N/2` to `N/4`) immediately, causing cache misses at almost every step (therefore inefficient access).

There is a caveat: this is optimal for **write-once, read-many** workloads. In write-heavy cases, insertion is expensive `O(N)` as it often requires reconstructing the entire array -- this is where a flat array is likely better.