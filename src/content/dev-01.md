# Eytzinger Layout

> Credit to [@onebignick](https://www.nicholasong.fyi/) for showing me this

[Eytzinger Layout](https://algorithmica.org/en/eytzinger) optimises the memory access pattern of binary search by storing the sorted data in a balanced binary tree, instead of a flat array. This allows for access of the next midpoint in a breadth-first search order:

![alt text](images/eytzinger.png)

Recall that a complete binary tree is stored in an array where the children of the node at index `k` are located at indices `2k + 1` and `2k + 2`. Since the next midpoint is always a child node of the current midpoint, there is significant spatial locality at higher levels of the tree.

In the first few iterations, we often hit the same L1 CPU cache line (that was pulled) when the root node was retrieved. In contrast, a standard sorted array binary search makes massive jumps (e.g., from index `N/2` to `N/4`) immediately, causing cache misses at almost every step.

There is a caveat to be noted: this is optimal for write-once, read-many workloads. Insertion is expensive (*O(N)*) as it often requires reconstructing the entire array. It is likely more efficient to just use a flat array for write-heavy instances.




