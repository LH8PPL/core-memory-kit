---
id: P-XNG4DaB2
type: project
title: kiro-cli-rejects-bom-in-agent-config-ps-convertto-json-adds-it
created_at: 2026-06-24T07:09:42Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: 49c91b8ad0f33c8199b62423862ad35c4b218767956ca72e98c26f5cd8ce83bd
related: [d198-fix-built-kiro-dir-location-open-file-uri-resolution-question, TRUE-root-cause-kiro-cli-agent-config-wrong-location-no-hooks-fire]
---

PROBE-TOOLING NOTE (2026-06-24): editing a kiro-cli agent config (~/.kiro/agents/cmk.json) via PowerShell `ConvertTo-Json | Set-Content -Encoding utf8` ADDS A UTF-8 BOM (bytes EF BB BF). kiro-cli's agent loader/validator REJECTS a BOM'd config: "invalid: expected value at line 1 column 1" → falls back to the built-in kiro_default ("agent 'cmk' not found, using 'kiro_default'; invalid agent config: cmk.json"). The kit's own installKiroCliAgent writes clean BOM-less UTF-8 (Node fs.writeFileSync), so PRODUCTION is fine — this only bit when I hand-edited via PowerShell to wire diagnostic probes. FIX for editing: use Node (fs.readFileSync/writeFileSync 'utf8') not PowerShell ConvertTo-Json. RELEVANT to the kit: this is the OTHER side of D-187 (we made our READS BOM-tolerant; kiro-cli's OWN reader is NOT — so the kit must never WRITE a BOM, which it doesn't). After re-installing clean from the build + wiring probes via Node, `kiro-cli agent validate` passed. The cmk agent IS now the resolved default (`* cmk Global` in `kiro-cli agent list`) — the D-198 location fix works; only the BOM from my PS edit had temporarily broken it.

**Why:** A BOM from PowerShell ConvertTo-Json broke the live cmk agent ('invalid agent config' → fell back to kiro_default), looking like the D-198 fix failed when it hadn't. kiro-cli's own config reader is NOT BOM-tolerant (the inverse of the kit's D-187 read-tolerance). The kit writes clean UTF-8 so production is unaffected; only hand-editing via PowerShell injects the BOM.

**How to apply:** When hand-editing a kiro agent config for diagnostics, use Node (fs.writeFileSync 'utf8'), never PowerShell `ConvertTo-Json | Set-Content`. To detect: first byte 239 (0xEF) = BOM; 123 ('{') = clean. The kit's installKiroCliAgent is correct (Node-written, no BOM). After a clean re-install + Node-wired probes, kiro-cli agent validate passes and `* cmk Global` shows as default.
