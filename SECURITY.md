# Security and privacy

Use synthetic data in the public demonstration. This application is not a clinical system, an anonymization service, or a substitute for an organization's security review.

## Data boundary

The static browser application reads a chosen JSON file or pasted text into memory, parses it locally, and creates an analysis model. It does not send the input to a server, resolve reference URLs, load attachment URLs, render narrative XHTML, or persist cases between sessions. No API key, clinical database, patient dataset, telemetry service, or login is required.

The review model contains fixed rule text, local resource aliases, allowlisted field names and shapes, structural paths, relationships, counts, and policy settings. Original resource ids, full URLs, unknown field names, source values, and filenames are excluded from this model. The report exporters consume the analysis model, not the original resource. The paste input is necessarily visible while the user edits it and is cleared after an import attempt or cancellation.

These are application design properties, not a guarantee of confidentiality in every browser or hosting environment. Use a controlled local environment for any organizational assessment, with an appropriate legal and governance basis. The public demo is for synthetic data only.

## Threat model

| Risk | Implemented control | Remaining limitation |
| --- | --- | --- |
| Accidental upload of imported data | No application network/telemetry client; browser CSP disallows connections | The host still receives page and asset requests. Browser extensions, device software, or a modified deployment are outside this boundary. |
| Script or HTML injection from input | Input is treated as data; source narrative, attachments, URLs, and values are not rendered; dynamic markup uses escaped text and allowlisted analysis fields | This is not a general-purpose HTML sanitizer. Changes to rendering must preserve the boundary. |
| Prototype pollution or ambiguous JSON | Bounded parser rejects reserved object keys and duplicate decoded keys; parsed objects have null prototypes | Some otherwise legitimate JSON is intentionally unsupported. |
| Browser exhaustion | Byte, depth, node, string, resource, and finding limits | Limits reduce workload but do not provide a measured service-level guarantee. |
| Numeric alteration during parsing | Finite numeric values are restricted to at most 15 significant mantissa digits; nonzero underflow is rejected | Arbitrary-precision FHIR decimal handling is outside this release. |
| Sensitive values copied into a report | Fixed messages, resource aliases, allowlisted locations, and a separate report model | Structural patterns, resource counts, dates chosen for review, and findings can still be sensitive. Reports are not certified anonymous. |
| Data remaining after review | No app case storage; clear/reset controls drop current application references | JavaScript cannot promise secure memory erasure. Browser/OS caches, swap, clipboard history, and downloaded files remain outside app control. |
| Credentials or private data committed to source | Synthetic examples, manual review, and source/build scanning in CI | Pattern scanning has false negatives and does not establish that all sensitive information is absent. |
| Supply-chain/deployment changes | No third-party npm/runtime dependencies; readable modules; CI verifies the build | Node, GitHub Actions, the host, and the browser are dependencies. A static site can still be modified by an authorized or compromised publisher. |

## Safe development and operation

- Keep fixtures synthetic, small, and reproducible. Use reserved example domains and invented identifiers.
- Do not commit imported files, report exports, databases, contact information, credentials, clinical attachments, or real screenshots.
- Run `npm test`, `npm run build`, and `npm run check` before publishing. Review source and generated assets when changing input, rendering, export, or deployment behavior.
- Treat privacy findings as field-presence prompts. They do not detect every kind of sensitive data, inspect hidden attachment content, or establish de-identification.
- Review downloaded reports before sharing them. Clear the workspace and delete local exports according to the applicable data policy.
- The CLI also processes locally. Redirecting output creates a file under the caller's control; avoid running it in systems that automatically capture or publish output.

## Reporting a vulnerability

Do not include real clinical data, secrets, or exploit details in a public issue. If GitHub private vulnerability reporting is available for this repository, use its **Security → Report a vulnerability** route. Otherwise, open a minimal public issue requesting a private reporting route without disclosing the vulnerability or sensitive material.

A useful report identifies the affected revision, the security boundary that fails, and a minimal synthetic reproduction. Security behavior is maintained in the current repository revision; no support commitment is implied for older copies or independently modified deployments.

For broader context, see [HL7 R4 security guidance](https://hl7.org/fhir/R4/security.html). FHIR structure alone does not supply a complete security architecture.
