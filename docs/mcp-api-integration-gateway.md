# MCP/API integration capability gateway

Agents should reason in terms of **capabilities**, not embed every provider-specific API.

Example:

**Agent → Integration Capability Gateway → authorized adapter → API / MCP / protocol / SDK → service**

An API is a service's programming interface. MCP can expose tools/capabilities to an AI agent and may itself call an API underneath. SMTP and similar standards are protocols. Provider SDKs are client libraries over service interfaces. These are different integration mechanisms and the architecture can register each without confusing them.

The gateway records:
- capability;
- adapter identity;
- interface type (API, MCP, protocol or SDK);
- authorization status;
- operating status;
- selection priority.

An agent receives only an adapter that is both authorized and operating and that the agent is explicitly allowed to use.

This prevents a general-purpose agent from gaining access to every connected service merely because the service exists.

Provider-specific authentication, rate limits, request formats, retries and version handling belong in the adapter. Agent/business logic remains provider-independent.

If a provider changes its API:
**detect integration degradation → report through System Coordination → research current supported interface → repair/upgrade adapter → CI/compatibility/security tests → controlled rollout → verify dependency chain.**

No integration gateway may bypass a provider's authorization, security controls, terms or technical restrictions.
