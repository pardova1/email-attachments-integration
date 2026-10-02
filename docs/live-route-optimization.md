# Live route optimization

A route chosen at the beginning of a large-file email is not assumed to remain the best route for the entire transfer.

The Route Optimization Agent can re-evaluate the affected transfer using remaining file size, current measured/estimated throughput, latency, operating status, capacity and error conditions.

If another eligible route is materially faster, or the active route becomes unavailable, the agent may recommend switching that individual lane. Small theoretical gains do not trigger unnecessary movement because switching itself has cost and risk.

**Observe → compare eligible routes → continue current route OR safely switch affected lane → continue transfer → ✓ VERIFIED EXACT**

Route changes remain subject to security, integrity, authorization, expiration and applicable data-location requirements. Unrelated lanes are not moved because another transfer changes route.
