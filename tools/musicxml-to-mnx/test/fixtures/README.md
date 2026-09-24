# Test fixtures

- `basic.musicxml` — hand-written for this package.
- `simple-repeat.musicxml` — copied unmodified from [`w3c-cg/musicxmlTestSuite`](https://github.com/w3c-cg/musicxmlTestSuite) (`45a-SimpleRepeat.musicxml`), MIT licensed. Used to exercise the pipeline's unsupported-construct failure path (a repeat played more than twice, outside our supported subset — see `AGENTS.md` "MusicXML").
