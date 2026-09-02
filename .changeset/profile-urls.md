---
'@1001-digital/ethereum-names': minor
---

Add profile-page links: `names.profileUrl(name, system?)` and a standalone `profileUrl(name, bareLabel?, registries?)` build the URL of a name's public profile page on its system's frontend, offline — `vitalik.eth` → `https://app.ens.domains/vitalik.eth`, `alice.gwei` → `https://gwei.domains/#alice`, `alice.wei` → `https://wei.domains/#alice`. Custom registries declare theirs via the new `profileUrl` field — a `{name}`/`{label}` URL template or a function — which is validated at construction and exposed on `SystemDescriptor`. Display data only, same trust caveat as `label` and `url`.
