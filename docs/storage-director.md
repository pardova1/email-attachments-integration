# Storage Director Agent

The main storage branch is coordinated by a Storage Director Agent. It dispatches each independent transfer lane to an eligible regional storage area and reserves an independent backup storage route.

Selection considers operating status, available capacity, latency, error rate and whether the area can accept the transfer. Production selection must also enforce security and applicable data-location/privacy requirements.

## Required problem sequence

Primary Storage Problem →

**Backup Storage Automatically Activated → Analyzing → Correcting Any Issues → Affected Transfer Continues → Other Lanes Remain Unaffected → ✓ VERIFIED EXACT**

A storage problem is scoped to the affected transfer/region wherever possible. Unrelated lanes and other operating regions continue processing.

Backup activation never constitutes successful delivery by itself. The permanent file-integrity command still requires final cryptographic verification against the sender's original before the transfer can be marked successfully delivered.

The Storage Director is agentic within pre-authorized operational boundaries: it may select eligible storage, switch an affected transfer to backup capacity, analyze transfer/storage operating status, coordinate recovery and continue processing. It must not weaken integrity, security, expiration or applicable data-location requirements merely to choose a faster route.
