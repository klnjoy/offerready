---
icon: material/shield-lock
---

# AI Security Interview Q&A — Senior & Scenario-Based

*Last reviewed: October 2026*

These questions cover securing LLM applications and agents in production. Interviewers want engineers who assume the model can be manipulated, design so that manipulation has limited impact, and can explain how they would detect, contain and audit an incident.

## Core concepts

??? question "What is prompt injection, and how do direct and indirect injection differ?"
    **Short answer:** Prompt injection is when attacker-controlled text changes the model's behaviour against the developer's intent; direct injection comes from the user, indirect injection hides in content the model reads, such as web pages, emails or documents.

    **In depth:** Direct injection is a user typing instructions like 'ignore previous instructions'. Indirect injection is more dangerous because the victim is a legitimate user: a retrieved document or tool result contains hidden instructions, and the model follows them with the user's permissions. Models do not reliably separate instructions from data, so there is no complete fix today. Defences are layered: treat all external content as untrusted, isolate it clearly in the prompt, restrict what tools can do, require confirmation for sensitive actions, filter outputs, and monitor for anomalies. Design so a successful injection cannot cause serious harm.

    **Follow-up they'll ask:** Can a better system prompt solve it? No; it raises the bar slightly, but architecture and permissions are the real controls.

??? question "How can an attacker exfiltrate data through an LLM agent's tools, and how do you prevent it?"
    **Short answer:** An injected instruction can make the agent read sensitive data and send it out via any outbound channel, such as a web request, an email, a rendered image URL or a link; prevention means limiting both sensitive access and outbound channels.

    **In depth:** The dangerous combination is access to private data, exposure to untrusted content, and the ability to communicate externally in the same session. Break that combination where possible. Restrict outbound requests with domain allowlists, block automatic rendering of markdown images and links to untrusted domains, and require user approval for sending emails or posting content. Scope tool credentials to the current user and task. Log every tool call with arguments so exfiltration attempts are visible. Red-team specifically for these chains rather than single prompts.

    **Follow-up they'll ask:** Why is markdown image rendering a risk? The model can put data into an image URL query string, and the client fetches it automatically.

??? question "How do you apply least privilege to agents and their tools?"
    **Short answer:** Give each agent only the tools and scopes needed for its task, act with the end user's delegated permissions rather than a powerful service account, and gate high-impact actions behind approval.

    **In depth:**
    - Separate read tools from write tools, and expose narrow operations such as 'create draft' instead of generic 'run SQL' or 'execute shell'.
    - Use short-lived, user-scoped tokens through OAuth delegation, so the agent cannot exceed the user's own access.
    - Enforce authorization in the tool backend, not in the prompt.
    - Require human confirmation for irreversible, financial or external actions.
    - Sandbox code execution with no network or tightly limited egress.
    - Set limits on steps, spend and rate per session.

    Review tool permissions like any other access review.

    **Follow-up they'll ask:** What about MCP servers? Treat each as a third-party integration: vet it, scope its credentials, and pin versions.

??? question "How should secrets be handled in LLM applications?"
    **Short answer:** Secrets never go into prompts, model context or logs; they stay in a secrets manager and are used by backend code or tools on the model's behalf.

    **In depth:** Anything in the context window can be extracted by injection or leaked in outputs, so API keys, connection strings and internal tokens must stay outside it. Tools receive credentials from a vault such as AWS Secrets Manager, Azure Key Vault or HashiCorp Vault at execution time, ideally via workload identity rather than static keys. Scan prompts, logs and traces for secret patterns and redact them. Rotate keys regularly and on any suspected exposure. Developer tooling matters too: coding agents with access to environment files or shells can leak secrets, so scope their access.

    **Follow-up they'll ask:** How do you detect a leaked key? Secret scanning in repos and logs, provider leak alerts, and anomaly detection on key usage.

??? question "How do you handle PII and data residency when using third-party model providers?"
    **Short answer:** Classify data, minimise what you send, redact or tokenise PII where possible, and choose providers and regions whose contractual terms and retention meet your obligations.

    **In depth:** Check the provider's data processing terms: whether inputs are used for training, retention periods, zero-retention options and the regions where processing happens. For regulated data, use regional endpoints or cloud-hosted models inside your own tenancy, or self-host. Redact PII before sending when the task does not need it, and detokenise in your own systems afterwards. Apply the same rules to logs, traces, eval datasets and caches, which often become the real leak. Support deletion requests across vector stores and backups. Document data flows for privacy reviews and data protection impact assessments.

    **Follow-up they'll ask:** Is redaction enough? Not always; context can re-identify people, so minimise data and restrict access too.

??? question "What is a jailbreak, and how is it different from prompt injection?"
    **Short answer:** A jailbreak tries to make the model violate its safety policies, such as producing harmful content; prompt injection tries to hijack the application's intended behaviour, often to misuse tools or data.

    **In depth:** Jailbreaks use role-play, obfuscation, encoding, many-shot examples or gradual multi-turn escalation. The main risk is reputational, legal or safety harm from outputs. Prompt injection targets the application's trust boundaries, and the risk is unauthorised actions or data leakage. Defences overlap: model-level safety training, input and output classifiers, and monitoring. For jailbreaks, output moderation and abuse detection per account matter most. For injection, architecture and permissions matter most. Both need continuous red-teaming because new techniques appear constantly.

    **Follow-up they'll ask:** How do you handle repeat abusers? Detect patterns per account, apply rate limits or suspensions, and review flagged sessions.

??? question "Why is insecure handling of model output a vulnerability, and how do you prevent it?"
    **Short answer:** Model output is untrusted input; if it flows into HTML, SQL, shell commands or other systems without validation, it enables XSS, injection and remote code execution.

    **In depth:** A model influenced by injected content can produce a script tag, a malicious SQL clause or a shell command. Treat output like user input: encode HTML when rendering, sanitise markdown, use parameterised queries, and never pass output directly to eval or a shell. Prefer structured outputs validated against a strict schema, and map them to allowlisted operations. For text-to-SQL, run under read-only roles with row-level security, query timeouts and result limits. For code execution, use sandboxes with no secrets and restricted network.

    **Follow-up they'll ask:** Does structured output make it safe? It narrows the shape, but field values still need validation and authorization.

??? question "What are the main AI supply chain risks, covering models and packages?"
    **Short answer:** Risks include malicious or backdoored model weights, unsafe serialization formats, poisoned datasets, compromised or typosquatted packages, and untrusted plugins or tool servers.

    **In depth:**
    - Model files: pickle-based formats can execute code on load; prefer safetensors and scan artifacts.
    - Provenance: download from trusted sources, verify hashes or signatures, and keep an inventory of models in use.
    - Packages: pin and hash dependencies, use private mirrors, and scan for typosquats and known vulnerabilities.
    - Datasets: fine-tuning data can be poisoned to create backdoors; track lineage and review sources.
    - Tool servers and plugins: vet, pin versions and restrict permissions.

    Maintain an SBOM that includes models and datasets.

    **Follow-up they'll ask:** How do you detect a backdoored model? It is hard; rely on provenance, behavioural evals and red-teaming on trigger patterns.

## Scenarios

??? question "Walk through the OWASP Top 10 for LLM applications and how you would use it."
    **Short answer:** It is a community list of the most critical LLM application risks, including prompt injection, sensitive information disclosure, supply chain, data and model poisoning, improper output handling, excessive agency, system prompt leakage, vector and embedding weaknesses, misinformation and unbounded consumption.

    **In depth:** I use it as a checklist in design reviews and threat models rather than a compliance target. For each risk I map the controls in our architecture: permission-filtered retrieval for embedding weaknesses, output encoding for improper output handling, tool scoping and approvals for excessive agency, quotas and budgets for unbounded consumption. Gaps become backlog items with owners. It also gives a shared vocabulary with security teams and auditors. The list is revised periodically, so check the current edition rather than relying on memory of item numbers.

    **Follow-up they'll ask:** Which risk do teams most underestimate? Excessive agency, because tool permissions grow quietly as features are added.

??? question "Your support agent reads customer emails and can issue refunds — an attacker sends an email with hidden instructions — what do you do?"
    **Short answer:** Contain the incident, then redesign so untrusted email content can never trigger a refund without independent authorization checks and human approval above a threshold.

    **In depth:**
    - Immediately: disable or restrict the refund tool, review logs for refunds linked to suspicious emails, and reverse fraudulent ones.
    - Architecture: separate reading untrusted content from privileged actions; the refund tool checks eligibility rules in backend code, not the model's judgement.
    - Add limits per customer and per day, and human approval above a value threshold.
    - Detection: flag emails with instruction-like content and alert on unusual refund patterns.
    - Add the attack to the red-team suite and regression tests.

    The model can recommend a refund; policy code decides it.

    **Follow-up they'll ask:** Would an injection classifier be enough? No; classifiers miss novel attacks, so they are one layer, not the control.

??? question "How would you run a red-teaming programme for an LLM product?"
    **Short answer:** Define threats and harms per product, combine automated attack suites with expert manual testing, track findings like vulnerabilities, and turn every finding into a regression test.

    **In depth:** Start with a threat model: assets, users, tools, trust boundaries and the harms that matter most. Automated tools generate injection, jailbreak and data extraction attempts at scale in CI and before releases. Manual red-teamers find creative multi-step and indirect attacks, especially through tools and retrieved content. Score findings by impact and exploitability, assign owners and SLAs, and verify fixes. Re-test whenever models, prompts or tools change, since any of them can reopen old issues. Report trends to leadership, such as attack success rate over time.

    **Follow-up they'll ask:** Who should red-team? A mix of internal security, domain experts and periodically external specialists for fresh perspective.

??? question "What should you log and audit in an LLM application, and how do you balance that with privacy?"
    **Short answer:** Log who did what, with which model, prompt version, retrieved sources and tool calls, but redact sensitive content and control access and retention strictly.

    **In depth:** An audit trail should let you reconstruct any action: user and tenant identity, timestamps, model and prompt versions, retrieved document ids, tool calls with arguments and results, approvals and guardrail decisions. Store full prompts and outputs only where policy allows, redacted and with short retention; logs often hold more sensitive data than the primary database. Restrict log access with least privilege and audit that access too. Make audit logs tamper-evident, for example with append-only storage. Feed security-relevant events into the SIEM for alerting.

    **Follow-up they'll ask:** How do you handle a deletion request? Delete or anonymise across logs, traces, caches and eval datasets according to retention policy.

??? question "A user discovers they can make your chatbot reveal its system prompt — how serious is it and what do you change?"
    **Short answer:** The leak itself is usually low to medium severity; it becomes serious if the prompt contains secrets, internal details or security logic that should be enforced elsewhere.

    **In depth:** Assume system prompts will leak, because reliable prevention is not currently possible. Review the prompt for credentials, internal URLs, customer data or business rules whose disclosure helps attackers. Move secrets to the backend, and move any authorization or policy enforcement into code rather than instructions. Output filters can catch verbatim leakage, but paraphrases get through. If the prompt is valuable intellectual property, accept the risk or keep the advantage in data, tools and evaluation rather than wording. Document the decision.

    **Follow-up they'll ask:** Should you block the user? Only if behaviour shows broader abuse; prompt extraction alone is a common curiosity.

??? question "How do you set up AI governance in an organisation that is rapidly adopting LLMs?"
    **Short answer:** Create a lightweight, risk-tiered process: an inventory of AI systems, clear policies on data and approved tools, reviews scaled by risk, and ongoing monitoring with named owners.

    **In depth:**
    - Inventory every model, use case, data flow and vendor, including shadow AI tools.
    - Tier use cases by risk: internal productivity versus customer-facing decisions affecting people.
    - Higher tiers require threat modelling, evals for quality and bias, human oversight and documentation.
    - Publish clear rules on which data can go to which tools.
    - Map obligations from regulations such as the EU AI Act and frameworks such as NIST AI RMF or ISO/IEC 42001 where they apply.
    - Provide approved, paved-road platforms so teams do not route around governance.

    **Follow-up they'll ask:** How do you avoid governance slowing everyone down? Make low-risk paths self-service and reserve deep review for high-risk use cases.

??? question "Your RAG system indexes a shared drive and a user retrieves salary data they should not see — how do you respond?"
    **Short answer:** Treat it as a data exposure incident: contain it, find the root cause in permission handling, assess who accessed what, and fix the pipeline so retrieval enforces source permissions.

    **In depth:**
    - Contain: remove the affected documents or source from the index and purge caches.
    - Investigate: was the ACL missing at ingestion, stale after a change, or was the index built with a service account that bypassed permissions?
    - Assess impact from audit logs: which users retrieved those chunks, then follow the incident and notification process with privacy and legal.
    - Fix: sync ACLs from the source, filter at query time, and default-deny documents with unknown permissions.
    - Prevent: permission tests with negative cases and alerts on sensitive labels appearing in results.

    **Follow-up they'll ask:** Why default-deny? A document with missing or unparsed permissions should be invisible until its access is known.
