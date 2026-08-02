# Security

Please report a vulnerability privately through GitHub's security advisory feature for this repository. Do not include personal or confidential data in a public issue.

The service accepts only small same-origin JSON telemetry requests with allowlisted event names. It applies a strict content security policy, blocks framing, has no authentication surface, and performs search entirely in the browser. Runtime telemetry contains no search terms or selected public records and expires after 35 days.
