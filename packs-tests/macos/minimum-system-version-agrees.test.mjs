import { ruleTester } from '../../engine-tests/helpers.mjs';
import minimumSystemVersionAgrees from '../../packs/macos/minimum-system-version-agrees.mjs';

const manifest = (platforms) => `// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "Fixture",
  platforms: [${platforms}],
  products: [.executable(name: "Fixture", targets: ["Fixture"])],
  targets: [.executableTarget(name: "Fixture")]
)
`;

const plist = (body) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Fixture</string>
${body}
</dict>
</plist>
`;

const floorKey = (value) => `  <key>LSMinimumSystemVersion</key>\n  <string>${value}</string>`;

ruleTester(minimumSystemVersionAgrees, {
  flagged: {
    'a plist floor below the package platform floor': {
      files: {
        'Package.swift': manifest('.macOS(.v14)'),
        'Resources/Info.plist': plist(floorKey('13.0')),
      },
      at: [{
        file: 'Resources/Info.plist', line: 7, severity: 'blocking',
        what: /LSMinimumSystemVersion is 13\.0.*macOS floor of 14/,
        fix: /<string>14<\/string>/,
      }],
    },
    'the string form of the platform floor is read too': {
      files: {
        'Package.swift': manifest('.macOS("14.1")'),
        'Info.plist': plist(floorKey('14.0')),
      },
      at: [{ file: 'Info.plist', what: /macOS floor of 14\.1/ }],
    },
    'a two-part enum floor (.v10_15) disagreeing with the plist': {
      files: {
        'mac/Package.swift': manifest('.macOS(.v10_15)'),
        'mac/Resources/Info.plist': plist(floorKey('11.0')),
      },
      at: [{ file: 'mac/Resources/Info.plist', what: /macOS floor of 10\.15/ }],
    },
    'every plist making a disagreeing claim is reported': {
      files: {
        'Package.swift': manifest('.macOS(.v14), .iOS(.v17)'),
        'App/Info.plist': plist(floorKey('13.0')),
        'Helper/Info.plist': plist(floorKey('12.0')),
      },
      at: [
        { file: 'App/Info.plist', what: /is 13\.0/ },
        { file: 'Helper/Info.plist', what: /is 12\.0/ },
      ],
    },
  },
  clean: {
    'the two agree exactly': {
      files: {
        'Package.swift': manifest('.macOS(.v14)'),
        'Resources/Info.plist': plist(floorKey('14.0')),
      },
    },
    '14 / 14.0 / 14.0.0 are one floor, not three (FP guard)': {
      files: {
        'Package.swift': manifest('.macOS(.v14)'),
        'Resources/Info.plist': plist(floorKey('14.0.0')),
      },
    },
    'a two-part enum floor spelled out in the plist (FP guard)': {
      files: {
        'Package.swift': manifest('.macOS(.v10_15)'),
        'Resources/Info.plist': plist(floorKey('10.15')),
      },
    },
    'a plist that makes no floor claim is not missing one (FP guard)': {
      files: {
        'Package.swift': manifest('.macOS(.v14)'),
        'Resources/Info.plist': plist('  <key>LSUIElement</key>\n  <true/>'),
      },
    },
    'a build substitution is not a version this check can read (FP guard)': {
      files: {
        'Package.swift': manifest('.macOS(.v14)'),
        'Resources/Info.plist': plist(floorKey('$(MACOSX_DEPLOYMENT_TARGET)')),
      },
    },
    'the key inside an XML comment is not a claim (FP guard)': {
      files: {
        'Package.swift': manifest('.macOS(.v14)'),
        'Resources/Info.plist': plist(`  <!--\n${floorKey('13.0')}\n  -->`),
      },
    },
    'a .macOS(…) only in a Swift comment declares no floor (FP guard)': {
      files: {
        'Package.swift': `// swift-tools-version:5.9
import PackageDescription

// Was platforms: [.macOS(.v14)] before the floor moved into the build script.
let package = Package(name: "Fixture", targets: [.executableTarget(name: "Fixture")])
`,
        'Resources/Info.plist': plist(floorKey('13.0')),
      },
    },
    'a .macOS(…) outside the platforms: array is not the floor (FP guard)': {
      files: {
        'Package.swift': `// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "Fixture",
  targets: [.executableTarget(
    name: "Fixture",
    swiftSettings: [.define("MAC", .when(platforms: [.macOS]))],
    linkerSettings: [.unsafeFlags(["-target"], .when(platforms: [.macOS("14.0")]))]
  )]
)
`,
        'Resources/Info.plist': plist(floorKey('13.0')),
      },
    },
    'a package manifest deeper than one directory is not this repo\'s package (FP guard)': {
      files: {
        'tests/fixtures/pkg/Package.swift': manifest('.macOS(.v14)'),
        'Resources/Info.plist': plist(floorKey('13.0')),
      },
    },
    'an iOS-only platform floor says nothing about the Mac floor (FP guard)': {
      files: {
        'Package.swift': manifest('.iOS(.v17)'),
        'Resources/Info.plist': plist(floorKey('13.0')),
      },
    },
    'a package that declares no platforms at all (FP guard)': {
      files: {
        'Package.swift': 'import PackageDescription\n\nlet package = Package(name: "Fixture")\n',
        'Resources/Info.plist': plist(floorKey('13.0')),
      },
    },
  },
});
