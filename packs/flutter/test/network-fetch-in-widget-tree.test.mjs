import { declaredCheck, ruleTester } from '../../../engine-tests/helpers.mjs';

const networkFetchInWidgetTree = declaredCheck('packs/flutter', 'flutter/network-fetch-in-widget-tree');

// The shape the rule asks for: the provider arrives as a parameter, so a test can
// hand the widget an in-memory substitute.
const INJECTED = `import 'package:flutter/material.dart';

class Avatar extends StatelessWidget {
  const Avatar({super.key, required this.portrait});

  final ImageProvider portrait;

  @override
  Widget build(BuildContext context) => Image(image: portrait);
}
`;

ruleTester(networkFetchInWidgetTree, {
  flagged: {
    'a screen building Image.network itself': {
      files: {
        'lib/screens/show_page.dart':
          "import 'package:flutter/material.dart';\n"
          + 'Widget poster(String url) => Image.network(url);\n',
      },
      at: [{
        file: 'lib/screens/show_page.dart', line: 2, severity: 'blocking',
        what: /fetches its own image from inside the widget tree/,
        fix: /take the ImageProvider or TileProvider as a parameter/,
      }],
    },
    'a widget reaching the network through a NetworkImage provider': {
      files: {
        'lib/widgets/avatar.dart':
          "import 'package:flutter/material.dart';\n"
          + 'Decoration face(String url) => BoxDecoration(\n'
          + '  image: DecorationImage(image: NetworkImage(url)),\n'
          + ');\n',
      },
      at: [{ file: 'lib/widgets/avatar.dart', line: 3 }],
    },
    'the cached_network_image spelling of the same fetch': {
      files: {
        'lib/ui/gallery.dart':
          "import 'package:cached_network_image/cached_network_image.dart';\n"
          + 'Widget tile(String url) => CachedNetworkImage(imageUrl: url);\n',
      },
      at: [{ file: 'lib/ui/gallery.dart', line: 2 }],
    },
    'a map whose tiles come off the network': {
      files: {
        'lib/ui/map_view.dart':
          "import 'package:flutter_map/flutter_map.dart';\n"
          + 'TileLayer tiles() => TileLayer(tileProvider: NetworkTileProvider());\n',
      },
      at: [{ file: 'lib/ui/map_view.dart', line: 2 }],
    },
  },
  clean: {
    'the widget takes its provider as a parameter (FP guard)': {
      files: { 'lib/ui/avatar.dart': INJECTED },
    },
    'the real provider constructed where the adapters are wired (FP guard)': {
      files: {
        'lib/main.dart':
          "import 'ui/avatar.dart';\n"
          + 'void main() => runApp(Avatar(portrait: NetworkImage(profileUrl)));\n',
        'lib/adapters/tiles.dart':
          'TileProvider liveTiles() => NetworkTileProvider();\n',
        'lib/ui/avatar.dart': INJECTED,
      },
    },
    'a comment naming the constructor it warns about (FP guard)': {
      files: {
        'lib/ui/notes.dart':
          '/// Never Image.network(url) here — the golden renders an error box.\n'
          + "// NetworkImage(url) is main.dart's to construct.\n"
          + INJECTED,
      },
    },
    // Both of the next two are the call anchor's doing: it is what separates
    // constructing a fetcher from naming one.
    'a substitute whose name merely extends the constructor name (FP guard)': {
      files: {
        'lib/ui/preview.dart':
          "import 'package:flutter/material.dart';\n"
          + 'Widget preview() => Image(image: FakeNetworkImageProviderStub());\n',
      },
    },
    'naming the type without constructing one (FP guard)': {
      files: {
        'lib/ui/debug_banner.dart':
          'bool isRemote(ImageProvider p) => p is NetworkImage;\n',
      },
    },
    'the widget tree is the scope, so a test file of its own is out of it (FP guard)': {
      files: {
        'test/ui/avatar_test.dart':
          'void main() => expect(NetworkImage(url), isNotNull);\n',
      },
    },
  },
});
