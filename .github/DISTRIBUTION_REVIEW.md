# Distribution Review: 2026-09-14

The owner requested removal of FreeTube-derived application implementations,
selected AGPL-3.0 for WorldTube and explicitly requested repository, download
page and installer publication. The SPDX choice is AGPL-3.0-only.

The four identified replacement groups are recorded in
docs/PROVENANCE_REPLACEMENTS.md. Current SABR input mapping and Shaka integration
were reviewed against installed YouTube.js, googlevideo and Shaka API contracts.
The SABR protocol engine is the separately MIT-licensed googlevideo dependency;
WorldTube's adapter/parser implement Shaka's public integration contracts.

The final read-only candidate scan returned no exact token runs at the
24-token cutoff, no shared regex literals and no byte-identical reference
assets. Normalized candidates are imports, public API field maps, permission
denial callbacks and binary-format structure. No additional concrete copied
application block was identified for replacement in this technical scope.

This closes the actionable technical review; it is not a certification of
independent authorship or a legal audit of every historical revision. AGPL
selection is not evidence that copied code was removed. Historical findings
and corrections remain documented, not erased or hidden by scan thresholds.

Official local fonts and complete third-party notices are recorded in
THIRD_PARTY_NOTICES.md. Runtime notices and WorldTube's license accompany
installers. The release workflow supplies the corresponding source archive.

Publication runs only on an explicit version tag or manual release invocation.
All requested platform jobs must finish successfully before the draft becomes
public. macOS remains opt-in with signing credentials; unavailable downloads
are disabled, not advertised as working installers.
