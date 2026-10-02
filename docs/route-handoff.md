# Safe route handoff

When the Route Optimization Agent identifies a materially better eligible route, a very large transfer should not automatically restart from zero.

The Route Handoff Coordinator records a checkpoint of confirmed parts and their integrity values. A new route may resume from verified progress only after the checkpoint is validated.

**Current route → verified checkpoint → prepare target route → resume affected lane from verified progress → final whole-file verification → ✓ VERIFIED EXACT**

If checkpoint integrity cannot be established, the system does not claim that progress is safe to reuse. Recovery logic determines which parts must be retransmitted from the sender-original byte stream.

The handoff is scoped to one transfer/lane. Other lanes continue independently.

A route switch never authorizes file transformation. The receiver's completed bytes must still cryptographically match the sender's original.
