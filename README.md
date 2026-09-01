# lezer-promql

> A fork of Prometheus's
> [lezer-promql](https://github.com/prometheus/prometheus/tree/main/web/ui/module/lezer-promql),
> published as `@oxynote/lezer-promql`. It adds one thing: Grafana-style
> duration placeholders (`$__interval`, `$__range`, `$__rate_interval`) parse
> as durations, so an editor does not mark a templated query as broken.
> Everything else is upstream's, and `NOTICE` lists the changes.
>
> Upstream lives inside the Prometheus monorepo, so it is tracked here on the
> `upstream` branch — the module's directory at a pinned release tag, and
> nothing else. `main` is that branch plus the changes above, and syncing is
> a merge. See [SYNCING.md](SYNCING.md).

## Overview

This is a PromQL grammar for the [lezer](https://lezer.codemirror.net/) parser system. It is inspired by the initial
grammar coming from [Prometheus](https://github.com/prometheus/prometheus/blob/main/promql/parser/generated_parser.y)
written in yacc.

This library is stable but doesn't provide any guideline of how to use it as it has been integrated
into [codemirror-promql](https://github.com/prometheus/prometheus/blob/main/web/ui/module/codemirror-promql). Reach for
**@prometheus-io/codemirror-promql** rather than this package directly — it parses through whichever grammar resolves
under the `@prometheus-io/lezer-promql` specifier, which is what the override below redirects here.

**Note**: This library is a lezer-based implementation of the [authoritative, goyacc-based PromQL grammar](https://github.com/prometheus/prometheus/blob/main/promql/parser/generated_parser.y). 
Any changes to the authoritative grammar need to be reflected in this package as well.

## Installation

This package is available as an npm package:

```bash
npm install --save @oxynote/lezer-promql
```

To have it replace upstream's grammar for every consumer in a project —
including `@prometheus-io/codemirror-promql`, which imports it directly —
add an override rather than an import alias:

```json
"pnpm": {
  "overrides": {
    "@prometheus-io/lezer-promql": "npm:@oxynote/lezer-promql@0.314.0-oxynote.1"
  }
}
```

**Note**: you will have to manually install the `lezer` dependencies as it is a peer dependency to this package.

```bash
npm install --save @lezer/lr @lezer/highlight
```

## Development

### Building

    pnpm install
    pnpm run build

### Testing

    pnpm run test

## License

The code is licensed under an [Apache 2.0](LICENSE) license, as upstream is.
`NOTICE` carries Prometheus's attribution and the list of changes made here.
