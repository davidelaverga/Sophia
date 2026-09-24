# Configuration contracts and specimens

These files make the decisions machine-readable. They are **not a generated, installed or live-tested deployment**. `models.json`, `roles.json` and `runtime-unit.json` use Sophia-owned schemas. Do not pass those documents directly into a provider SDK.

`dsh/profile.package.example.json` uses the actual `dsh.profile.bundles` declaration [DSH-19]. The bundle manifest uses `dsh.bundle.patch`, with a real upstream precedent [DSH-20]. The patch uses verified upstream row IDs and insertion syntax [DSH-04, DSH-05]. It still needs the compiled Sophia plugin and its complete role/tool restrictions before product use.

During S1-01, build or resolve the selected dsh release from its recorded source, commit package locks and record artifact digests. During S1-03, install the compiled Sophia bundle into the isolated profile directory, write the profile manifest, and start the official `dsh --profile sophia-runtime`. Runtime-affecting `DSH_*` values are inherited environment variables, not a project `.env` file. Use a literal `[]` for an intentionally empty patch. [DSH-03]

`runtime-unit.json` deliberately contains nulls for unbuilt package/image digests. They must be filled from build output before deployment, not guessed. The validation script checks this pack's integrity but does not convert null build facts into readiness.

Configured models are named explicitly. Missing credentials or unavailable models produce a visible unavailable result. No silent provider switch, hidden API charge after a native subscription cap, or `latest` alias upgrade is part of the first release. The OpenAI snapshots are dated; Google and DeepSeek IDs without dated snapshots retain their actual response identity and observation date.
