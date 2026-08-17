# Cross-domain guides

TRIZ transfers through system functions and contradictions, not by replacing technical nouns with
business nouns. Use the same workflow, but define domain-specific flows, evidence, and harms.

## Demand

- System: offer, buyer/user, channel, alternatives, purchase or adoption process.
- Flows: attention, information, trust, money, access, and value realization.
- Typical contradictions: reach versus qualification; conversion versus trust; price versus access;
  variety versus decision effort; growth versus service capacity.
- Useful tools: key stakeholder requirements, flow analysis, cause-effect chain, system operator,
  benchmarking, feature transfer, separation by segment/condition/time.
- Evidence: qualified conversion, acquisition cost, activation, retention, refund or complaint rate,
  adverse selection, and downstream service cost.

Do not count exposure as demand. State the job, decision, and realized outcome.

## Supply

- System: suppliers, capacity, inventory, logistics, quality control, and demand signal.
- Flows: material, work, information, cash, capacity, and risk.
- Typical contradictions: availability versus inventory; speed versus quality; utilization versus
  resilience; supplier concentration versus coordination cost.
- Useful tools: flow and resource analysis, operating zone/time, functional analysis, trimming,
  technical/physical contradictions, dynamics, and preliminary action.
- Evidence: fill rate, lead time, on-time-in-full, yield, utilization, recovery time, working capital,
  and quality escapes.

Track displaced queues and risks; a faster local step can worsen the total system.

## Engagement

- System: user, desired job, product/service, content or prompts, and feedback loop.
- Flows: attention, effort, information, reward, and learning.
- Typical contradictions: frequency versus fatigue; personalization versus privacy; immediate reward
  versus durable value; simplicity versus informed control.
- Useful tools: stakeholder requirements, functional and flow analysis, cause-effect chain, separation
  by condition/time, feedback, periodic action, and self-service.
- Evidence: retained useful action, task success, return prompted by value, long-term retention,
  fatigue, opt-outs, complaints, and well-being or safety guardrails.

Do not optimize compulsion or time spent when it conflicts with the user's goal.

## Public relations

- System: organization, affected publics, media/channels, evidence, spokespeople, and response process.
- Flows: facts, interpretations, attention, trust, questions, and corrections.
- Typical contradictions: speed versus accuracy; openness versus privacy; consistency versus local
  relevance; visibility versus message distortion.
- Useful tools: stakeholder requirements, cause-effect chain, flow analysis, operating time,
  system operator, inversion, preliminary action, feedback, and intermediaries.
- Evidence: factual accuracy, response time, message pickup and fidelity, correction rate, trust,
  informed stakeholder action, and unresolved concerns.

Never fabricate support, suppress material facts, impersonate independent voices, or optimize reach
through deception. Treat trust as an outcome, not a message property.

## Product, service, process, and organization

- Product/service: model the user's outcome plus delivery and support functions, not only features.
- Process: examine queues, handoffs, rework, decision rights, and information latency.
- Organization: define a decision owner, affected units, incentives, capabilities, and supersystem
  constraints. People are stakeholders and agents, not interchangeable components.
- Evidence: combine outcome, cost, time, quality, resilience, and harm metrics. Use a pilot or
  quasi-experiment where causal attribution matters.

## Software

- System: services and their clients, data stores, queues, caches, external dependencies, and the
  deployment platform.
- Flows: requests, data, control signals, cost, latency budget, and failure signals.
- Typical contradictions: latency versus consistency; caching speed versus staleness; throughput
  versus isolation; observability versus overhead; release speed versus stability; automation
  versus control; security versus usability; batching efficiency versus tail latency.
- Useful tools: functional and flow analysis, cause-effect chain on incidents, resource analysis
  (compute, budget, attention), separation in time/space/condition/system level (the usual
  resolution of cache staleness and consistency conflicts), trimming of steps and components,
  trends (increasing controllability, transition to microlevel), size-time-cost to break scale
  fixation.
- Evidence: p50/p95/p99 latency, error and timeout rates, staleness window, consistency-violation
  rate, throughput, cost per request, MTTR, alert precision, rollback frequency, guardrails on
  blast radius.

Software systems are engineering systems: the 39 parameters map naturally here (speed, capacity,
reliability, complexity of measurement). Still model the causal contradiction in domain terms
first, and treat a microservice boundary as a system boundary — the mapping guardrail below
applies to organizational layers, not to technical properties.

## Mapping guardrail

The 39-parameter contradiction matrix was built for engineering systems. Outside that context:

1. write the causal contradiction in domain language first;
2. map to engineering parameters only when the physical or operational analogy is precise;
3. record the mapping as a hypothesis;
4. use the matrix as an ideation prompt, not empirical evidence;
5. prefer non-matrix tools when the mapping changes the meaning of the problem.
