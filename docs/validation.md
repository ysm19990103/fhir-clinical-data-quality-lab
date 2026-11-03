# Validation methodology and limits

The lab targets a focused subset of **FHIR R4 4.0.1**. Its source-linked checks support data review; they do not establish full FHIR, implementation-guide, terminology, or clinical validity. The executable catalog in `app/catalog.mjs` is the authoritative list of implemented rule identifiers and messages.

## Three kinds of finding

| Basis | Meaning | Typical example |
| --- | --- | --- |
| FHIR R4 subset | An implemented constraint from the R4 representation, datatype, or focused resource definition | Conflicting value choices; selected required element missing; invalid checked date |
| Local quality rule | A review expectation that can be useful for a particular export or analysis | Missing optional subject; mixed unit codes; potentially repeated observation |
| Coverage limit or privacy review | A limit of what was assessed, or a field-presence prompt | Profile not validated; logical reference unresolved; narrative field present |

Errors, warnings, and information are not a clinical risk scale. A report with no error findings can still contain unknown fields, unsupported constraints, invalid terminology, incomplete clinical meaning, or sensitive content.

## Supported input

The root is a JSON resource object. Collection and searchset Bundles are reviewed as collections. Single resources are also accepted. One level of contained resources participates in the inventory and local reference analysis. Nested contained resources produce an error and are not recursively reviewed. Other Bundle workflows are identified as outside scope; document, message, transaction, batch, and history semantics are not inferred.

Selected checks cover Patient, Observation, Encounter, Condition, DiagnosticReport, and MedicationRequest. Other resource types receive generic representation review and an explicit coverage notice. The lab does not load StructureDefinitions or assert that every element of a supported resource was checked.

## Rule families and sources

| Rules | Implemented intent | Official reference |
| --- | --- | --- |
| `STR-*` | Selected shape, required-element, primitive, choice, enum, JSON-empty/null, id, and temporal representations; coverage notices for profiles and additional semantics | [JSON](https://hl7.org/fhir/R4/json.html), [datatypes](https://hl7.org/fhir/R4/datatypes.html), [validation](https://hl7.org/fhir/R4/validation.html) |
| `BND-*` | Supported Bundle workflow, entry identity, fullUrl shape/consistency, repeated identity/version, and selected metadata restrictions | [Bundle](https://hl7.org/fhir/R4/bundle.html) |
| `REF-*` | Shape, scoped local target resolution, ambiguity, selected target types, and unresolved logical/remote references | [References](https://hl7.org/fhir/R4/references.html), [Bundle resolution](https://hl7.org/fhir/R4/bundle.html) |
| `TIM-*` | Definite reversed Periods, optional birth/event chronology, and temporal-ordering limitations | [Datatypes](https://hl7.org/fhir/R4/datatypes.html), [Patient](https://hl7.org/fhir/R4/patient.html) |
| `OBS-*` | Observation value/dataAbsentReason conflict and Quantity code/system dependency | [Observation](https://hl7.org/fhir/R4/observation.html), [Quantity](https://hl7.org/fhir/R4/datatypes.html) |
| `DQ-*` | Optional completeness, coding/unit metadata, unit representation differences, and potential repetition | [Validation scope](https://hl7.org/fhir/R4/validation.html), [Observation](https://hl7.org/fhir/R4/observation.html), [datatypes](https://hl7.org/fhir/R4/datatypes.html) |
| `PRV-*` | Presence of demographic/identifier, text, or embedded-content fields; no value classification | [Security](https://hl7.org/fhir/R4/security.html) |

Resource-specific required elements and status/intent checks are drawn from the corresponding R4 definitions: [Patient](https://hl7.org/fhir/R4/patient.html), [Observation](https://hl7.org/fhir/R4/observation.html), [Encounter](https://hl7.org/fhir/R4/encounter.html), [Condition](https://hl7.org/fhir/R4/condition.html), [DiagnosticReport](https://hl7.org/fhir/R4/diagnosticreport.html), and [MedicationRequest](https://hl7.org/fhir/R4/medicationrequest.html). A source link explains the surrounding standard; it does not mean the lab implements everything on that page.

## Reference resolution

Contained references are scoped to their containing resource. Absolute URNs and full URLs use local identities. Relative REST references are resolved using the source entry's REST-shaped fullUrl server base; contained resources inherit the containing entry's base. The lab does not join records merely because their type/id suffix matches. Version-specific references additionally use resource version metadata. Multiple matches remain ambiguous.

A target absent from a partial export is not proof that the target does not exist. The app never makes a network request to test that assumption. Identifier-only, display-only, and extension-based references can be legitimate representations; the lab identifies their unresolved status. Target-type checks cover only the reference fields listed in `app/references.mjs`.

## Temporal handling

Calendar validity is checked independently from temporal order. Year-only, month, and day values retain their precision as intervals. A definite order conflict requires the intervals to be disjoint in the relevant direction. Mixed zoned and unzoned comparisons retain timezone uncertainty. Equal Period bounds are not treated as a reversal.

Full timestamps require the supported FHIR syntax, including seconds and a timezone. Leap-second timestamps and fractions finer than nanosecond precision may be syntactically accepted while receiving an explicit notice that ordering was not assessed. No clinical date is corrected or imputed. Birth/event chronology is a local review policy, not a universal clinical rule.

## Completeness, coding, units, and repetition

Completeness policies can flag optional subjects/times, concepts without a complete system/code pair, or quantities lacking unit metadata. Text-only concepts and dimensionless quantities can be legitimate. Final observations with component or hasMember representations are not assumed to need a scalar value.

Mixed unit codes for a shared concept prompt review; they do not prove dimensional incompatibility. The lab does not perform unit conversion, validate all UCUM syntax, or determine analyte-specific equivalence. A small known-token comparison can identify a display/code discrepancy, but is not a terminology service.

Potential repetition uses selected matching subject, concept, status, complete effective-time representation, result, and context fields. Period ends remain part of the comparison. It is a heuristic, not a duplicate diagnosis. Repeated measurements and revisions may be legitimate. The lab never merges or removes resources.

## Bounded input and output

| Limit | Value |
| --- | --- |
| UTF-8 input size | 2 MiB |
| JSON nesting depth | 40 |
| Parsed nodes | 100,000 |
| Individual decoded string length | 131,072 UTF-16 code units |
| Resources including contained resources | 500 |
| Findings | 5,000; truncation is reported |
| Numeric parsing | Finite values, at most 15 significant mantissa digits; nonzero underflow rejected |

Duplicate decoded object keys and the reserved keys `__proto__`, `prototype`, and `constructor` are rejected. These restrictions protect deterministic local processing. Input rejected by a local limit may still be legitimate FHIR; use tooling suited to its size and precision requirements.

## Reports

JSON preserves the structured analysis model. CSV provides the findings table. Standalone HTML supports review and printing. The [R4 OperationOutcome](https://hl7.org/fhir/R4/operationoutcome.html) export uses the R4 issue representation and resource-level expressions; display paths can be more specific review hints and are not asserted to be executable FHIRPath.

When there are no findings, an informational OperationOutcome issue describes the limited review rather than asserting full validation success. A truncated finding set remains explicitly marked. All report formats omit original input values and resource identifiers, but structural information may still warrant controlled handling.

## Verification strategy

The test suite covers parser behavior and limits, temporal semantics, reference resolution, selected rule behavior, and privacy canaries. Tests exercise both expected findings and cases that should not be flagged. Build checks inspect JavaScript syntax and selected accidental-secret, data-file, transport, and persistence patterns. Browser review checks interaction and rendering separately from the engine tests.

These checks are development evidence, not certification or an exhaustive formal proof. To assess a real integration, combine an appropriate full FHIR validator, implementation-guide/profile validation, terminology validation, authorized source-system review, and the organization's governance process.
