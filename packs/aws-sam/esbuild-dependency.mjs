import { patternRule } from '../../engine/checks/helpers/pattern-rules.mjs';

export default patternRule({
  id: 'aws-sam/esbuild-dependency',
  severity: 'blocking',
  description: 'esbuild must be a regular dependency, not a devDependency, for SAM esbuild builds',
  doc: 'packs/aws-sam/RULES.md',
  why: "SAM's esbuild builder runs a production-only npm install, so a devDependency esbuild is skipped and the build fails",
  relevantWhen: {
    someTrackedFileContains: { pathMatching: /(^|\/)template\.ya?ml$/, text: /BuildMethod:\s*esbuild/ },
    exactlyOneTrackedFileMatches: /(^|\/)package\.json$/,
  },
  checkParsedFile: [{
    file: 'package.json',
    whenFieldPresent: 'devDependencies.esbuild',
    requireField: 'dependencies.esbuild',
    what: 'esbuild is a devDependency, but SAM BuildMethod: esbuild needs it as a regular dependency',
    fix: 'move esbuild into "dependencies" (SAM\'s build runs a production-only npm install), or put it on the runner PATH before `sam build`',
  }],
});
