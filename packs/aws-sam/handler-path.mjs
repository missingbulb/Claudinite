import { finding } from '../../engine/checks/helpers/findings.mjs';
import { samResources } from '../../engine/checks/helpers/sam-templates.mjs';

// Converted from the aws-sam prose (issue #136): under BuildMethod: esbuild with a
// single subdirectory entry point and no OutBase, esbuild's default outbase is the
// entry's own dir, so the subdirectory is dropped from the artifact — the Handler
// must not carry it (`handler.handler`, not `src/handler.handler`). Wrong value
// fails only at first invoke with Runtime.ImportModuleError. Blocking.
//
// FP guards (from adversarial mining): skip when OutBase is set (it changes the
// drop) or when there is more than one entry point (behavior differs).
const rule = {
  id: 'aws-sam/handler-path',
  severity: 'blocking',
  description: 'A SAM esbuild single-entry Handler must not carry the entry subdirectory',
  doc: 'packs/aws-sam/RULES.md',
  why: "esbuild's default outbase is the entry's own dir, so the subdir is stripped from the artifact and a subdir Handler fails at invoke",

  run(ctx) {
    const out = [];
    for (const { templatePath, name, resource } of samResources(ctx)) {
      if (resource.Type !== 'AWS::Serverless::Function') continue;
      const meta = resource.Metadata;
      if (!meta || meta.BuildMethod !== 'esbuild') continue;
      const bp = meta.BuildProperties;
      const entries = bp && Array.isArray(bp.EntryPoints) ? bp.EntryPoints : null;
      if (!entries || entries.length !== 1) continue; // multiple/none: behavior differs
      if (bp.OutBase != null) continue; // OutBase overrides the subdir drop
      const entry = String(entries[0]);
      const slash = entry.lastIndexOf('/');
      if (slash === -1) continue; // no subdir to drop
      const subdir = entry.slice(0, slash);
      const handler = resource.Properties && resource.Properties.Handler;
      if (typeof handler === 'string' && handler.startsWith(`${subdir}/`)) {
        out.push(finding(rule, {
          file: templatePath,
          what: `${name}: Handler "${handler}" keeps the "${subdir}/" prefix esbuild drops`,
          fix: `set Handler to "${handler.slice(subdir.length + 1)}" (esbuild writes the bundle to the artifact root), or set BuildProperties.OutBase if you intend to keep the subdir`,
        }));
      }
    }
    return out;
  },
};

export default rule;
